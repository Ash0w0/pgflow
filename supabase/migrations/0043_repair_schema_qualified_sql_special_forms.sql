-- PostgreSQL parses COALESCE, GREATEST, LEAST, and CURRENT_DATE as SQL
-- special forms rather than ordinary pg_catalog functions. Schema-qualifying
-- them can survive CREATE FUNCTION but fail only when the affected statement
-- is first executed. Repair every currently-live public function definition
-- in place so existing OIDs, grants, trigger bindings, and security settings
-- remain unchanged.

do $repair_sql_special_forms$
declare
  v_function record;
  v_definition text;
  v_repaired text;
  v_signature text;
  v_expected_signatures constant text[] := array[
    'public.process_resident_moveout(uuid,uuid,uuid,date,numeric,numeric,numeric,text)',
    'public.create_maintenance_ticket(uuid,uuid,uuid,text,text,text,text,text)',
    'public.log_whatsapp_message(uuid,text,text,text,text,text,text,text,jsonb,uuid)',
    'public.reopen_rejected_public_payment_request()',
    'public.invoke_pgflow_whatsapp_worker()',
    'public.claim_whatsapp_outbox(text,integer,integer)',
    'public.finish_whatsapp_outbox(uuid,text,text,timestamptz,text,text)',
    'public.claim_whatsapp_webhooks(text,integer,integer)',
    'public.create_whatsapp_move_out_request(uuid,date,text)'
  ];
begin
  foreach v_signature in array v_expected_signatures loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception using
        errcode = '42883',
        message = 'Expected function is missing before SQL special-form repair: ' || v_signature;
    end if;
  end loop;

  for v_function in
    select resolved.oid, resolved.oid::pg_catalog.regprocedure as signature
    from pg_catalog.unnest(v_expected_signatures) as expected(signature)
    cross join lateral (
      select pg_catalog.to_regprocedure(expected.signature)::oid as oid
    ) as resolved
    order by resolved.oid
  loop
    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);
    v_repaired := pg_catalog.replace(v_definition, 'pg_catalog.coalesce', 'coalesce');
    v_repaired := pg_catalog.replace(v_repaired, 'pg_catalog.greatest', 'greatest');
    v_repaired := pg_catalog.replace(v_repaired, 'pg_catalog.least', 'least');
    v_repaired := pg_catalog.replace(v_repaired, 'pg_catalog.current_date', 'current_date');
    execute v_repaired;
  end loop;

  foreach v_signature in array v_expected_signatures loop
    v_definition := pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(v_signature)
    );
    if pg_catalog.strpos(v_definition, 'pg_catalog.coalesce') > 0
      or pg_catalog.strpos(v_definition, 'pg_catalog.greatest') > 0
      or pg_catalog.strpos(v_definition, 'pg_catalog.least') > 0
      or pg_catalog.strpos(v_definition, 'pg_catalog.current_date') > 0
    then
      raise exception using
        errcode = 'P0001',
        message = 'SQL special-form repair did not complete for ' || v_signature;
    end if;
  end loop;
end
$repair_sql_special_forms$;

-- Payment evidence acknowledgement belongs in the same transaction as the
-- pending-review payment. This covers app, secure-link, and WhatsApp evidence
-- submissions without relying on a fallible post-commit API enqueue.
create or replace function public.enqueue_resident_proof_received_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $enqueue_resident_proof_received$
declare
  v_contact public.whatsapp_contacts;
begin
  if new.state <> 'pending_review' then
    return new;
  end if;

  select contact.* into v_contact
  from public.whatsapp_contacts as contact
  where contact.organization_id = new.organization_id
    and contact.tenant_id = new.tenant_id
    and contact.role = 'resident'
    and contact.consent_state = 'opted_in'
  order by contact.created_at
  limit 1;

  if not found then
    return new;
  end if;

  perform public.enqueue_whatsapp_intent(
    new.organization_id,
    v_contact.connection_id,
    v_contact.id,
    'proof_received',
    v_contact.language_code,
    'payment:' || new.id::text || ':proof-received',
    pg_catalog.jsonb_build_object(
      'kind', 'proof_received',
      'paymentId', new.id
    ),
    pg_catalog.now() + interval '7 days'
  );

  return new;
end
$enqueue_resident_proof_received$;

drop trigger if exists payments_enqueue_resident_proof_received
  on public.payments;
create trigger payments_enqueue_resident_proof_received
after insert on public.payments
for each row execute function public.enqueue_resident_proof_received_on_insert();

revoke all on function public.enqueue_resident_proof_received_on_insert()
  from public, anon, authenticated;
grant execute on function public.enqueue_resident_proof_received_on_insert()
  to service_role;

comment on function public.invoke_pgflow_whatsapp_worker() is
  'Invokes the authenticated PGFlow WhatsApp worker using Supabase Vault configuration.';

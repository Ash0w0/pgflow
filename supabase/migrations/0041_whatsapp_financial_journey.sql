-- Make financial state transitions and their WhatsApp intents one transaction.

alter table public.payments
  drop constraint if exists payments_submission_channel_check,
  drop constraint if exists payments_public_submission_identity_check,
  add column if not exists whatsapp_source_wamid text,
  add constraint payments_submission_channel_check check (
    submission_channel in ('account', 'public_payment_link', 'whatsapp')
  ),
  add constraint payments_submission_identity_check check (
    (
      submission_channel = 'account'
      and submitted_by is not null
      and payment_request_id is null
      and whatsapp_source_wamid is null
    )
    or (
      submission_channel = 'public_payment_link'
      and submitted_by is null
      and payment_request_id is not null
      and whatsapp_source_wamid is null
    )
    or (
      submission_channel = 'whatsapp'
      and submitted_by is null
      and payment_request_id is null
      and whatsapp_source_wamid is not null
    )
  );

create unique index if not exists payments_whatsapp_source_wamid_uq
  on public.payments(whatsapp_source_wamid)
  where whatsapp_source_wamid is not null;

create or replace function public.opt_out_whatsapp_phone(
  p_connection_id uuid,
  p_phone_e164 text,
  p_provider_wamid text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  with affected as (
    update public.whatsapp_contacts
    set consent_state = 'opted_out',
        reminders_enabled = false,
        weekly_report_enabled = false,
        updated_at = pg_catalog.now()
    where connection_id = p_connection_id
      and phone_e164 = p_phone_e164
    returning organization_id, id
  ), evidence as (
    insert into public.whatsapp_consent_events (
      organization_id, contact_id, event, source, provider_wamid, value
    )
    select organization_id, id, 'opt_out', 'inbound_command', p_provider_wamid, '{}'::jsonb
    from affected
    on conflict (contact_id, provider_wamid, event) do nothing
    returning id
  )
  select pg_catalog.count(*) into v_count from affected;
  return v_count;
end
$$;

create or replace function public.submit_whatsapp_upi_payment_evidence(
  p_contact_id uuid,
  p_invoice_id uuid,
  p_reference text,
  p_paid_at timestamptz,
  p_object_key text,
  p_content_type text,
  p_file_hash text,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_invoice public.invoices;
  v_payment_id uuid;
  v_reference text := pg_catalog.upper(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_reference), '[^A-Za-z0-9]', '', 'g')
  );
begin
  if pg_catalog.btrim(coalesce(p_provider_wamid, '')) = '' then
    raise exception using errcode = '22023', message = 'WhatsApp message identity is required.';
  end if;
  select * into v_contact
  from public.whatsapp_contacts
  where id = p_contact_id
    and role = 'resident'
    and consent_state = 'opted_in';
  if not found then
    raise exception using errcode = '42501', message = 'Resident WhatsApp contact is not active.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('whatsapp-payment:' || p_provider_wamid, 0)
  );
  select id into v_payment_id
  from public.payments
  where whatsapp_source_wamid = p_provider_wamid;
  if found then
    return pg_catalog.jsonb_build_object(
      'paymentId', v_payment_id,
      'state', 'pending_review',
      'deduplicated', true
    );
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and organization_id = v_contact.organization_id
    and tenant_id = v_contact.tenant_id
    and state in ('issued', 'partially_paid', 'overdue')
  for update;
  if not found or v_invoice.total_amount <= v_invoice.paid_amount then
    raise exception using errcode = 'P0001', message = 'This invoice cannot accept payment evidence.';
  end if;

  if v_reference !~ '^[A-Z0-9]{6,35}$'
    or p_paid_at < pg_catalog.now() - interval '90 days'
    or p_paid_at > pg_catalog.now() + interval '1 day'
  then
    raise exception using errcode = '22023', message = 'Payment reference or date is invalid.';
  end if;
  if p_file_hash !~ '^[a-f0-9]{64}$'
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_object_key !~ (
      '^organizations/' || v_contact.organization_id::text || '/payment-evidence/[^/]+$'
    )
  then
    raise exception using errcode = '22023', message = 'Screenshot evidence is invalid.';
  end if;

  v_payment_id := extensions.gen_random_uuid();
  insert into public.payments (
    id, organization_id, property_id, tenant_id, invoice_id, method,
    amount, reference, state, paid_at, submitted_by, note,
    payment_request_id, submission_channel, whatsapp_source_wamid
  ) values (
    v_payment_id, v_invoice.organization_id, v_invoice.property_id, v_invoice.tenant_id,
    v_invoice.id, 'upi', v_invoice.total_amount - v_invoice.paid_amount, v_reference,
    'pending_review', p_paid_at, null, 'Submitted through WhatsApp',
    null, 'whatsapp', p_provider_wamid
  );
  insert into public.payment_evidence (
    organization_id, payment_id, object_key, content_type, file_hash
  ) values (
    v_invoice.organization_id, v_payment_id, p_object_key, p_content_type, p_file_hash
  );
  insert into public.audit_events (
    organization_id, actor_id, actor_kind, action, entity_type, entity_id, after_data
  ) values (
    v_invoice.organization_id, null, 'system', 'whatsapp.payment_upi_submitted',
    'payment', v_payment_id::text,
    pg_catalog.jsonb_build_object(
      'invoiceId', v_invoice.id,
      'contactId', v_contact.id,
      'providerWamid', p_provider_wamid,
      'amount', v_invoice.total_amount - v_invoice.paid_amount,
      'state', 'pending_review'
    )
  );
  return pg_catalog.jsonb_build_object(
    'paymentId', v_payment_id,
    'state', 'pending_review',
    'deduplicated', false
  );
end
$$;

create or replace function public.enqueue_owner_payment_review_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  if new.state <> 'pending_review' then return new; end if;
  select contact.* into v_contact
  from public.whatsapp_contacts contact
  join public.memberships membership
    on membership.organization_id = contact.organization_id
   and membership.id = contact.membership_id
  where contact.organization_id = new.organization_id
    and contact.consent_state = 'opted_in'
    and membership.property_id = new.property_id
    and membership.role in ('owner', 'accountant')
    and membership.state = 'active'
  order by case membership.role when 'owner' then 0 else 1 end, contact.created_at
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id,
    v_contact.connection_id,
    v_contact.id,
    'payment_review',
    v_contact.language_code,
    'payment-review:' || new.id::text || ':submitted',
    pg_catalog.jsonb_build_object('kind', 'payment_review', 'paymentId', new.id),
    pg_catalog.now() + interval '48 hours'
  );
  return new;
end
$$;

drop trigger if exists payments_enqueue_owner_whatsapp_review on public.payments;
create trigger payments_enqueue_owner_whatsapp_review
after insert on public.payments
for each row execute function public.enqueue_owner_payment_review_on_insert();

create or replace function public.enqueue_payment_rejection_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  if old.state = new.state or new.state <> 'rejected' then return new; end if;
  select * into v_contact
  from public.whatsapp_contacts
  where organization_id = new.organization_id
    and tenant_id = new.tenant_id
    and role = 'resident'
    and (
      consent_state = 'opted_in'
      or (consent_state = 'opted_out' and essential_enabled)
    )
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id,
    v_contact.connection_id,
    v_contact.id,
    'proof_rejected',
    v_contact.language_code,
    'payment:' || new.id::text || ':rejected',
    pg_catalog.jsonb_build_object(
      'kind', 'proof_rejected',
      'paymentId', new.id,
      'reason', coalesce(new.rejection_reason, 'Payment evidence could not be verified')
    ),
    pg_catalog.now() + interval '7 days'
  );
  return new;
end
$$;

drop trigger if exists payments_enqueue_resident_rejection on public.payments;
create trigger payments_enqueue_resident_rejection
after update of state on public.payments
for each row execute function public.enqueue_payment_rejection_on_update();

alter table public.receipts
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

create or replace function public.build_receipt_snapshot(
  p_organization_id uuid,
  p_property_id uuid,
  p_payment_id uuid,
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_receipt_number text,
  p_amount bigint,
  p_issued_at timestamptz
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'receiptNumber', p_receipt_number,
    'amount', p_amount,
    'issuedAt', p_issued_at,
    'organizationName', organization.name,
    'propertyName', property.name,
    'propertyAddress', property.address,
    'propertyContact', property.support_phone,
    'residentName', tenant.full_name,
    'billingPeriod', invoice.period,
    'paymentMethod', payment.method,
    'paymentReference', payment.reference,
    'paymentDate', payment.paid_at,
    'roomNumber', coalesce(room.code, property.name),
    'bedNumber', bed.label
  )
  from public.organizations organization
  join public.properties property
    on property.organization_id = organization.id and property.id = p_property_id
  join public.tenant_profiles tenant
    on tenant.organization_id = organization.id and tenant.id = p_tenant_id
  join public.invoices invoice
    on invoice.organization_id = organization.id and invoice.id = p_invoice_id
  join public.payments payment
    on payment.organization_id = organization.id and payment.id = p_payment_id
  left join lateral (
    select occupancy.bed_id
    from public.occupancies occupancy
    where occupancy.organization_id = organization.id
      and occupancy.tenant_id = tenant.id
    order by occupancy.created_at desc
    limit 1
  ) occupancy on true
  left join public.beds bed
    on bed.organization_id = organization.id and bed.id = occupancy.bed_id
  left join public.rooms room
    on room.organization_id = organization.id and room.id = bed.room_id
  where organization.id = p_organization_id
$$;

create or replace function public.populate_receipt_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.snapshot := public.build_receipt_snapshot(
    new.organization_id,
    new.property_id,
    new.payment_id,
    new.invoice_id,
    new.tenant_id,
    new.number,
    new.amount,
    new.issued_at
  );
  if new.snapshot is null then
    raise exception using errcode = 'P0001', message = 'Receipt snapshot could not be created.';
  end if;
  return new;
end
$$;

drop trigger if exists receipts_populate_snapshot on public.receipts;
create trigger receipts_populate_snapshot
before insert on public.receipts
for each row execute function public.populate_receipt_snapshot();

update public.receipts receipt
set snapshot = public.build_receipt_snapshot(
  receipt.organization_id,
  receipt.property_id,
  receipt.payment_id,
  receipt.invoice_id,
  receipt.tenant_id,
  receipt.number,
  receipt.amount,
  receipt.issued_at
)
where receipt.snapshot = '{}'::jsonb;

create or replace function public.protect_receipt_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.snapshot is distinct from old.snapshot then
    raise exception using errcode = '42501', message = 'Receipt snapshots are immutable.';
  end if;
  return new;
end
$$;

drop trigger if exists receipts_protect_snapshot on public.receipts;
create trigger receipts_protect_snapshot
before update of snapshot on public.receipts
for each row execute function public.protect_receipt_snapshot();

create or replace function public.enqueue_receipt_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  select * into v_contact
  from public.whatsapp_contacts
  where organization_id = new.organization_id
    and tenant_id = new.tenant_id
    and role = 'resident'
    and (
      consent_state = 'opted_in'
      or (consent_state = 'opted_out' and essential_enabled)
    )
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id,
    v_contact.connection_id,
    v_contact.id,
    'receipt',
    v_contact.language_code,
    'receipt:' || new.id::text || ':issued',
    pg_catalog.jsonb_build_object('kind', 'receipt', 'receiptId', new.id),
    pg_catalog.now() + interval '14 days'
  );
  return new;
end
$$;

drop trigger if exists receipts_enqueue_resident_whatsapp on public.receipts;
create trigger receipts_enqueue_resident_whatsapp
after insert on public.receipts
for each row execute function public.enqueue_receipt_on_insert();

revoke all on function public.submit_whatsapp_upi_payment_evidence(
  uuid,uuid,text,timestamptz,text,text,text,text
) from public, anon, authenticated;
revoke all on function public.opt_out_whatsapp_phone(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_whatsapp_upi_payment_evidence(
  uuid,uuid,text,timestamptz,text,text,text,text
) to service_role;
grant execute on function public.opt_out_whatsapp_phone(uuid,text,text)
  to service_role;

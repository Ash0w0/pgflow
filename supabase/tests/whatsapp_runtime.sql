-- Execute repaired SQL functions so schema-qualified SQL special forms cannot
-- hide behind successful CREATE FUNCTION statements.

begin;
select plan(27);

insert into auth.users (id, aud, role, email)
values (
  '43000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'runtime-owner@example.test'
);

insert into public.organizations (
  id, name, slug, template_version_id, state, resident_limit
) values (
  '43000000-0000-4000-8000-000000000010',
  'WhatsApp Runtime Test',
  'whatsapp-runtime-test',
  (select id from public.template_versions where version = '1.0.0'),
  'live',
  10
);

insert into public.properties (id, organization_id, name, upi_id, upi_payee_name)
values (
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000010',
  'Runtime Property',
  'runtime@upi',
  'Runtime Property'
);

insert into public.memberships (
  id, organization_id, property_id, auth_user_id, phone, display_name, role, state
) values (
  '43000000-0000-4000-8000-000000000030',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000001',
  '+919876540001',
  'Runtime Owner',
  'owner',
  'active'
);

insert into public.rooms (
  id, organization_id, property_id, floor_name, code, capacity, default_rent
) values (
  '43000000-0000-4000-8000-000000000040',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '1',
  'R-101',
  1,
  850000
);

insert into public.beds (
  id, organization_id, property_id, room_id, label, state
) values (
  '43000000-0000-4000-8000-000000000050',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000040',
  'A',
  'occupied'
);

insert into public.tenant_profiles (
  id, organization_id, property_id, full_name, phone
) values (
  '43000000-0000-4000-8000-000000000060',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  'Runtime Resident',
  '+919876540002'
);

insert into public.occupancies (
  id, organization_id, property_id, tenant_id, bed_id, move_in_date,
  monthly_rent, deposit_promised, state
) values (
  '43000000-0000-4000-8000-000000000070',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000060',
  '43000000-0000-4000-8000-000000000050',
  current_date - 30,
  850000,
  500000,
  'active'
);

insert into public.invoices (
  id, organization_id, property_id, tenant_id, period, number,
  due_date, total_amount, state
) values (
  '43000000-0000-4000-8000-000000000080',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000060',
  '2099-01',
  'RUNTIME-2099-01',
  current_date + 5,
  850000,
  'issued'
);

insert into public.whatsapp_connections (
  id, label, waba_id, phone_number_id, graph_version, state
) values (
  '43000000-0000-4000-8000-000000000090',
  'Runtime Connection',
  'runtime-waba',
  'runtime-phone-number',
  'v23.0',
  'test'
);

insert into public.whatsapp_contacts (
  id, organization_id, connection_id, tenant_id, role, phone_e164,
  display_name, language_code, consent_state, reminders_enabled
) values (
  '43000000-0000-4000-8000-0000000000a0',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000090',
  '43000000-0000-4000-8000-000000000060',
  'resident',
  '+919876540002',
  'Runtime Resident',
  'en',
  'opted_in',
  true
);

insert into public.whatsapp_contacts (
  id, organization_id, connection_id, membership_id, role, phone_e164,
  display_name, language_code, consent_state, weekly_report_enabled
) values (
  '43000000-0000-4000-8000-0000000000b0',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000090',
  '43000000-0000-4000-8000-000000000030',
  'owner',
  '+919876540001',
  'Runtime Owner',
  'en',
  'opted_in',
  true
);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
      and (
        pg_catalog.strpos(pg_catalog.pg_get_functiondef(procedure.oid), 'pg_catalog.coalesce') > 0
        or pg_catalog.strpos(pg_catalog.pg_get_functiondef(procedure.oid), 'pg_catalog.greatest') > 0
        or pg_catalog.strpos(pg_catalog.pg_get_functiondef(procedure.oid), 'pg_catalog.least') > 0
        or pg_catalog.strpos(pg_catalog.pg_get_functiondef(procedure.oid), 'pg_catalog.current_date') > 0
      )
  ),
  0::bigint,
  'live public functions contain no schema-qualified SQL special forms'
);

select lives_ok(
  'select public.invoke_pgflow_whatsapp_worker()',
  'the Vault-backed worker invocation executes when secrets are absent'
);

create temporary table runtime_enqueue_results (
  label text primary key,
  result jsonb not null
) on commit drop;

select lives_ok(
  $enqueue_runtime_intents$
    insert into runtime_enqueue_results (label, result)
    values
      (
        'first',
        public.enqueue_whatsapp_intent(
          '43000000-0000-4000-8000-000000000010',
          '43000000-0000-4000-8000-000000000090',
          '43000000-0000-4000-8000-0000000000a0',
          'rent_reminder',
          'en',
          'runtime:dedupe',
          '{"kind":"rent_reminder","invoiceId":"43000000-0000-4000-8000-000000000080","stage":"due"}'::jsonb,
          now() + interval '1 day'
        )
      ),
      (
        'second',
        public.enqueue_whatsapp_intent(
          '43000000-0000-4000-8000-000000000010',
          '43000000-0000-4000-8000-000000000090',
          '43000000-0000-4000-8000-0000000000a0',
          'rent_reminder',
          'en',
          'runtime:dedupe',
          '{"kind":"rent_reminder","invoiceId":"43000000-0000-4000-8000-000000000080","stage":"due"}'::jsonb,
          now() + interval '1 day'
        )
      )
  $enqueue_runtime_intents$,
  'the durable enqueue RPC executes twice with one dedupe key'
);

select ok(
  (select result->>'messageId' from runtime_enqueue_results where label = 'first')
    = (select result->>'messageId' from runtime_enqueue_results where label = 'second')
  and (
    select count(*) filter (where (result->>'deduplicated')::boolean) = 1
    from runtime_enqueue_results
  )
  and (
    select count(*) filter (where not (result->>'deduplicated')::boolean) = 1
    from runtime_enqueue_results
  ),
  'duplicate enqueue returns the original message and reports deduplication'
);

select is(
  (
    select count(*)
    from public.whatsapp_messages as message
    join public.whatsapp_outbox_jobs as job
      on job.organization_id = message.organization_id
     and job.message_id = message.id
    where message.organization_id = '43000000-0000-4000-8000-000000000010'
      and message.dedupe_key = 'runtime:dedupe'
      and job.dedupe_key = 'runtime:dedupe'
  ),
  1::bigint,
  'one message and one outbox job exist for a duplicate intent'
);

create temporary table runtime_claimed_outbox
on commit drop
as select *
from public.claim_whatsapp_outbox('runtime-outbox-a', 0, 0);

select is(
  (select count(*) from runtime_claimed_outbox),
  1::bigint,
  'outbox claim clamps a zero limit to one job'
);

select ok(
  (
    select lease_expires_at - leased_at >= interval '30 seconds'
    from runtime_claimed_outbox
  ),
  'outbox claim clamps the lease to at least thirty seconds'
);

select is(
  (
    select public.finish_whatsapp_outbox(
      id, 'runtime-outbox-wrong', 'retry_wait', null, 'retry', 'wrong lease'
    )
    from runtime_claimed_outbox
  ),
  false,
  'a different outbox worker cannot finish the lease'
);

create temporary table runtime_outbox_finish (
  result boolean not null
) on commit drop;

insert into runtime_outbox_finish (result)
select public.finish_whatsapp_outbox(
  id, 'runtime-outbox-a', 'retry_wait', null, 'retry', 'expected retry'
)
from runtime_claimed_outbox;

select ok(
  (select result from runtime_outbox_finish)
  and (
    select job.state = 'retry_wait'
      and job.lease_owner is null
      and job.available_at = claimed.available_at
    from public.whatsapp_outbox_jobs as job
    join runtime_claimed_outbox as claimed on claimed.id = job.id
  ),
  'the lease owner finishes the outbox job and NULL keeps available_at'
);

insert into public.whatsapp_webhook_events (
  connection_id, provider_event_key, phone_number_id, event_kind,
  provider_wamid, payload
) values (
  '43000000-0000-4000-8000-000000000090',
  'runtime:webhook:1',
  'runtime-phone-number',
  'message',
  'wamid.runtime.webhook.1',
  '{"value":{"id":"wamid.runtime.webhook.1"}}'::jsonb
);

create temporary table runtime_claimed_webhook
on commit drop
as select *
from public.claim_whatsapp_webhooks('runtime-webhook-a', 0, 0);

select is(
  (select count(*) from runtime_claimed_webhook),
  1::bigint,
  'webhook claim clamps a zero limit to one event'
);

select ok(
  (
    select lease_expires_at - leased_at >= interval '15 seconds'
    from runtime_claimed_webhook
  ),
  'webhook claim clamps the lease to at least fifteen seconds'
);

select is(
  (
    select public.finish_whatsapp_webhook(
      id, 'runtime-webhook-wrong', 'processed', null, null
    )
    from runtime_claimed_webhook
  ),
  false,
  'a different webhook worker cannot finish the lease'
);

create temporary table runtime_webhook_finish (
  result boolean not null
) on commit drop;

insert into runtime_webhook_finish (result)
select public.finish_whatsapp_webhook(
  id, 'runtime-webhook-a', 'processed', null, null
)
from runtime_claimed_webhook;

select ok(
  (select result from runtime_webhook_finish)
  and (
    select event.state = 'processed'
      and event.processed_at is not null
      and event.lease_owner is null
    from public.whatsapp_webhook_events as event
    join runtime_claimed_webhook as claimed on claimed.id = event.id
  ),
  'the webhook lease owner completes the event'
);

create temporary table runtime_maintenance_results (
  label text primary key,
  result jsonb not null
) on commit drop;

select lives_ok(
  $create_base_maintenance$
    insert into runtime_maintenance_results (label, result)
    values (
      'base',
      public.create_maintenance_ticket(
        '43000000-0000-4000-8000-000000000001',
        '43000000-0000-4000-8000-000000000010',
        '43000000-0000-4000-8000-000000000060',
        'R-101',
        'plumbing',
        'Runtime plumbing check',
        null,
        null
      )
    )
  $create_base_maintenance$,
  'base maintenance creation executes its COALESCE path'
);

select ok(
  (
    select ticket.priority = 'medium' and ticket.status = 'open'
    from public.maintenance_tickets as ticket
    where ticket.id = (
      select (result->>'ticketId')::uuid
      from runtime_maintenance_results
      where label = 'base'
    )
  ),
  'NULL maintenance priority defaults to medium'
);

select lives_ok(
  $create_whatsapp_maintenance$
    insert into runtime_maintenance_results (label, result)
    values
      (
        'whatsapp-first',
        public.create_whatsapp_maintenance_ticket(
          '43000000-0000-4000-8000-0000000000a0',
          'wifi',
          'The router is offline',
          'wamid.runtime.maintenance.1'
        )
      ),
      (
        'whatsapp-second',
        public.create_whatsapp_maintenance_ticket(
          '43000000-0000-4000-8000-0000000000a0',
          'wifi',
          'The router is offline',
          'wamid.runtime.maintenance.1'
        )
      )
  $create_whatsapp_maintenance$,
  'WhatsApp maintenance creation executes twice with one provider WAMID'
);

select ok(
  (select result->>'ticketId' from runtime_maintenance_results where label = 'whatsapp-first')
    = (select result->>'ticketId' from runtime_maintenance_results where label = 'whatsapp-second')
  and (
    select count(*) filter (where (result->>'deduplicated')::boolean) = 1
    from runtime_maintenance_results where label like 'whatsapp-%'
  )
  and (
    select count(*) filter (where not (result->>'deduplicated')::boolean) = 1
    from runtime_maintenance_results where label like 'whatsapp-%'
  ),
  'WhatsApp maintenance retry returns the original ticket'
);

select lives_ok(
  $log_first_whatsapp_message$
    select public.log_whatsapp_message(
      '43000000-0000-4000-8000-000000000010',
      '+919876540002',
      null,
      null,
      null,
      null,
      null,
      'runtime-log-key',
      '{"attempt":1}'::jsonb,
      '43000000-0000-4000-8000-000000000060'
    )
  $log_first_whatsapp_message$,
  'legacy WhatsApp message logging executes repaired default COALESCE paths'
);

select lives_ok(
  $log_second_whatsapp_message$
    select public.log_whatsapp_message(
      '43000000-0000-4000-8000-000000000010',
      '+919876540002',
      null,
      null,
      null,
      'wamid.runtime.log.1',
      'delivered',
      'runtime-log-key',
      '{"attempt":2}'::jsonb,
      '43000000-0000-4000-8000-000000000060'
    )
  $log_second_whatsapp_message$,
  'message-log retry executes the repaired conflict COALESCE path'
);

select ok(
  (
    select count(*) = 1
      and min(direction) = 'outbound'
      and min(language_code) = 'en'
      and min(delivery_status) = 'delivered'
      and min(wamid) = 'wamid.runtime.log.1'
    from public.whatsapp_message_logs
    where idempotency_key = 'runtime-log-key'
  ),
  'message-log retry is idempotent and preserves repaired defaults'
);

insert into public.invoice_payment_requests (
  id, organization_id, property_id, invoice_id, tenant_id, token_hash,
  state, expires_at, created_by, submitted_at
) values (
  '43000000-0000-4000-8000-0000000000c0',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000080',
  '43000000-0000-4000-8000-000000000060',
  pg_catalog.repeat('c', 64),
  'submitted',
  now() + interval '1 day',
  '43000000-0000-4000-8000-000000000001',
  now()
);

insert into public.payments (
  id, organization_id, property_id, tenant_id, method, amount, reference,
  state, paid_at, submitted_by, invoice_id, payment_request_id,
  submission_channel
) values (
  '43000000-0000-4000-8000-0000000000d0',
  '43000000-0000-4000-8000-000000000010',
  '43000000-0000-4000-8000-000000000020',
  '43000000-0000-4000-8000-000000000060',
  'upi',
  850000,
  'RUNTIME-UTR-1',
  'pending_review',
  now(),
  null,
  '43000000-0000-4000-8000-000000000080',
  '43000000-0000-4000-8000-0000000000c0',
  'public_payment_link'
);

insert into public.payments (
  id, organization_id, property_id, tenant_id, method, amount, reference,
  state, paid_at, submitted_by, invoice_id, payment_request_id,
  submission_channel, whatsapp_source_wamid
) values
  (
    '43000000-0000-4000-8000-0000000000e0',
    '43000000-0000-4000-8000-000000000010',
    '43000000-0000-4000-8000-000000000020',
    '43000000-0000-4000-8000-000000000060',
    'upi',
    100,
    'RUNTIME-UTR-2',
    'pending_review',
    now(),
    '43000000-0000-4000-8000-000000000001',
    '43000000-0000-4000-8000-000000000080',
    null,
    'account',
    null
  ),
  (
    '43000000-0000-4000-8000-0000000000f0',
    '43000000-0000-4000-8000-000000000010',
    '43000000-0000-4000-8000-000000000020',
    '43000000-0000-4000-8000-000000000060',
    'upi',
    200,
    'RUNTIME-UTR-3',
    'pending_review',
    now(),
    null,
    '43000000-0000-4000-8000-000000000080',
    null,
    'whatsapp',
    'wamid.runtime.payment.3'
  );

select ok(
  (
    select count(*) = 3
    from public.whatsapp_messages
    where organization_id = '43000000-0000-4000-8000-000000000010'
      and contact_id = '43000000-0000-4000-8000-0000000000a0'
      and kind = 'proof_received'
      and dedupe_key in (
        'payment:43000000-0000-4000-8000-0000000000d0:proof-received',
        'payment:43000000-0000-4000-8000-0000000000e0:proof-received',
        'payment:43000000-0000-4000-8000-0000000000f0:proof-received'
      )
      and intent->>'kind' = 'proof_received'
      and (intent->>'paymentId')::uuid in (
        '43000000-0000-4000-8000-0000000000d0',
        '43000000-0000-4000-8000-0000000000e0',
        '43000000-0000-4000-8000-0000000000f0'
      )
  )
  and (
    select count(*) = 3
    from public.whatsapp_messages
    where organization_id = '43000000-0000-4000-8000-000000000010'
      and contact_id = '43000000-0000-4000-8000-0000000000b0'
      and kind = 'payment_review'
      and dedupe_key in (
        'payment-review:43000000-0000-4000-8000-0000000000d0:submitted',
        'payment-review:43000000-0000-4000-8000-0000000000e0:submitted',
        'payment-review:43000000-0000-4000-8000-0000000000f0:submitted'
      )
  ),
  'all payment channels enqueue resident acknowledgement and preserve owner review'
);

select lives_ok(
  $reject_runtime_payment$
    update public.payments
    set state = 'rejected',
        rejection_reason = 'Runtime rejection',
        updated_at = now()
    where id = '43000000-0000-4000-8000-0000000000d0'
  $reject_runtime_payment$,
  'payment rejection executes the repaired resubmission trigger'
);

select ok(
  (
    select request.state = 'active'
      and request.submitted_at is null
      and request.expires_at >= now() + interval '6 days 23 hours'
    from public.invoice_payment_requests as request
    where request.id = '43000000-0000-4000-8000-0000000000c0'
  ),
  'rejected proof reopens and extends its resident payment request'
);

create temporary table runtime_moveout_results (
  label text primary key,
  result jsonb not null
) on commit drop;

select lives_ok(
  $create_runtime_moveouts$
    insert into runtime_moveout_results (label, result)
    values
      (
        'first',
        public.create_whatsapp_move_out_request(
          '43000000-0000-4000-8000-0000000000a0',
          current_date + 30,
          'wamid.runtime.moveout.1'
        )
      ),
      (
        'second',
        public.create_whatsapp_move_out_request(
          '43000000-0000-4000-8000-0000000000a0',
          current_date + 30,
          'wamid.runtime.moveout.1'
        )
      )
  $create_runtime_moveouts$,
  'WhatsApp move-out creation executes its repaired CURRENT_DATE checks'
);

select ok(
  (select result->>'requestId' from runtime_moveout_results where label = 'first')
    = (select result->>'requestId' from runtime_moveout_results where label = 'second')
  and (
    select count(*) filter (where (result->>'deduplicated')::boolean) = 1
    from runtime_moveout_results where label in ('first', 'second')
  )
  and (
    select count(*) filter (where not (result->>'deduplicated')::boolean) = 1
    from runtime_moveout_results where label in ('first', 'second')
  )
  and (
    select count(*) = 1
    from public.move_out_requests
    where organization_id = '43000000-0000-4000-8000-000000000010'
      and tenant_id = '43000000-0000-4000-8000-000000000060'
  ),
  'move-out retry returns one live request'
);

select lives_ok(
  $settle_runtime_moveout$
    insert into runtime_moveout_results (label, result)
    values (
      'settlement',
      public.process_resident_moveout(
        '43000000-0000-4000-8000-000000000001',
        '43000000-0000-4000-8000-000000000010',
        '43000000-0000-4000-8000-000000000060',
        current_date + 30,
        null,
        null,
        null,
        'Runtime settlement'
      )
    )
  $settle_runtime_moveout$,
  'move-out settlement executes every repaired COALESCE path'
);

select ok(
  (select (result->>'netRefundAmount')::numeric = 500000
   from runtime_moveout_results where label = 'settlement')
  and (
    select tenant.state = 'moved_out'
    from public.tenant_profiles as tenant
    where tenant.id = '43000000-0000-4000-8000-000000000060'
  )
  and (
    select occupancy.state = 'completed'
    from public.occupancies as occupancy
    where occupancy.id = '43000000-0000-4000-8000-000000000070'
  )
  and (
    select bed.state = 'vacant'
    from public.beds as bed
    where bed.id = '43000000-0000-4000-8000-000000000050'
  )
  and (
    select request.state = 'completed' and request.settlement_id is not null
    from public.move_out_requests as request
    where request.id = (
      select (result->>'requestId')::uuid
      from runtime_moveout_results
      where label = 'first'
    )
  ),
  'settlement closes occupancy, frees the bed, and completes the request'
);

select * from finish();
rollback;

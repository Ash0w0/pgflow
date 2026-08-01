begin;
select plan(8);

select ok(
  exists (
    select 1 from public.pgflow_release_sentinels
    where key = 'production_whatsapp_runtime_v1'
  ),
  'production WhatsApp runtime release sentinel is present'
);

insert into public.organizations (
  id, name, slug, template_version_id, state, resident_limit
) values (
  '44000000-0000-4000-8000-000000000010',
  'WhatsApp Activation Test',
  'whatsapp-activation-test',
  (select id from public.template_versions where version = '1.0.0'),
  'live',
  2
);

insert into public.properties (id, organization_id, name)
values (
  '44000000-0000-4000-8000-000000000020',
  '44000000-0000-4000-8000-000000000010',
  'Activation Property'
);

insert into public.tenant_profiles (
  id, organization_id, property_id, full_name, phone
) values (
  '44000000-0000-4000-8000-000000000030',
  '44000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000020',
  'Activation Resident',
  '+919876541111'
);

insert into public.whatsapp_connections (
  id, label, waba_id, phone_number_id, graph_version, state
) values (
  '44000000-0000-4000-8000-000000000040',
  'Activation Connection',
  'activation-waba',
  'activation-phone-number',
  'v23.0',
  'test'
);

insert into public.whatsapp_contacts (
  id, organization_id, connection_id, tenant_id, role, phone_e164,
  display_name, language_code, consent_state, reminders_enabled
) values (
  '44000000-0000-4000-8000-000000000050',
  '44000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000040',
  '44000000-0000-4000-8000-000000000030',
  'resident',
  '+919876541111',
  'Activation Resident',
  'hi',
  'unknown',
  false
);

insert into public.whatsapp_activation_tokens (
  id, organization_id, contact_id, token_hash, policy_version, expires_at
) values (
  '44000000-0000-4000-8000-000000000060',
  '44000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000050',
  pg_catalog.repeat('a', 64),
  '2026-08-01',
  pg_catalog.now() + interval '7 days'
), (
  '44000000-0000-4000-8000-000000000061',
  '44000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000050',
  pg_catalog.repeat('b', 64),
  '2026-08-01',
  pg_catalog.now() + interval '7 days'
);

create temporary table activation_results (
  label text primary key,
  result jsonb not null
) on commit drop;

select lives_ok(
  $activate_twice$
    insert into activation_results (label, result)
    values
      (
        'first',
        public.activate_whatsapp_contact(
          '44000000-0000-4000-8000-000000000040',
          '+919876541111',
          repeat('a', 64),
          'wamid.activation.same'
        )
      ),
      (
        'retry',
        public.activate_whatsapp_contact(
          '44000000-0000-4000-8000-000000000040',
          '+919876541111',
          repeat('a', 64),
          'wamid.activation.same'
        )
      )
  $activate_twice$,
  'first activation and provider retry both complete'
);

select ok(
  (select (result->>'activated')::boolean and not (result->>'deduplicated')::boolean
   from activation_results where label = 'first')
  and
  (select (result->>'activated')::boolean and (result->>'deduplicated')::boolean
   from activation_results where label = 'retry'),
  'activation response distinguishes the first call from an idempotent retry'
);

select ok(
  (
    select consent_state = 'opted_in'
      and reminders_enabled
      and activated_at is not null
    from public.whatsapp_contacts
    where id = '44000000-0000-4000-8000-000000000050'
  )
  and (
    select count(*) = 1
      and max(policy_version) = '2026-08-01'
    from public.whatsapp_consent_events
    where contact_id = '44000000-0000-4000-8000-000000000050'
      and event = 'opt_in'
      and provider_wamid = 'wamid.activation.same'
  ),
  'activation stores canonical consent state and policy evidence'
);

select ok(
  (
    select count(*) = 1
    from public.whatsapp_messages
    where contact_id = '44000000-0000-4000-8000-000000000050'
      and kind = 'welcome_consent'
  )
  and (
    select count(*) = 1
    from public.whatsapp_outbox_jobs as job
    join public.whatsapp_messages as message on message.id = job.message_id
    where message.contact_id = '44000000-0000-4000-8000-000000000050'
      and message.kind = 'welcome_consent'
  ),
  'activation transaction enqueues exactly one welcome message'
);

select ok(
  not (
    public.activate_whatsapp_contact(
      '44000000-0000-4000-8000-000000000040',
      '+919876549999',
      repeat('b', 64),
      'wamid.activation.wrong-phone'
    )->>'activated'
  )::boolean
  and (
    select used_at is null
    from public.whatsapp_activation_tokens
    where id = '44000000-0000-4000-8000-000000000061'
  ),
  'wrong-phone activation fails without consuming the token'
);

insert into public.whatsapp_contacts (
  id, organization_id, connection_id, tenant_id, role, phone_e164,
  display_name, language_code, consent_state, essential_enabled, routing_active
) values (
  '44000000-0000-4000-8000-000000000070',
  '44000000-0000-4000-8000-000000000010',
  '44000000-0000-4000-8000-000000000040',
  '44000000-0000-4000-8000-000000000030',
  'resident',
  '+919876542222',
  'Historical Activation Resident',
  'en',
  'opted_out',
  false,
  false
);

select is(
  (
    select count(*)
    from public.whatsapp_contacts
    where organization_id = '44000000-0000-4000-8000-000000000010'
      and tenant_id = '44000000-0000-4000-8000-000000000030'
  ),
  2::bigint,
  'inactive contact history is preserved for audit'
);

select has_index(
  'public',
  'whatsapp_contacts',
  'whatsapp_contacts_active_tenant_uq',
  'active resident routing is protected by a unique index'
);

select * from finish();
rollback;

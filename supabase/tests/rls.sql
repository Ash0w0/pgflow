-- Run with `supabase test db` after all migrations. The transaction rolls back
-- every fixture and exercises policies as real authenticated JWT subjects.

begin;
select plan(107);

select has_function('public', 'current_organization_ids', array[]::text[], 'RLS organization helper exists');
select ok(not has_table_privilege('anon', 'public.organizations', 'select'), 'anonymous users cannot read organizations');
select ok(not has_table_privilege('authenticated', 'public.platform_operators', 'select'), 'platform operator registry is server-only');
select ok(not has_table_privilege('authenticated', 'public.memberships', 'update'), 'clients cannot directly change roles');
select ok(not has_table_privilege('authenticated', 'public.brand_themes', 'update'), 'clients cannot directly change branding');
select ok(not has_table_privilege('anon', 'public.whatsapp_contacts', 'select'), 'anonymous users cannot read WhatsApp contacts');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_messages', 'select'), 'PG staff cannot bypass operator WhatsApp message views');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_outbox_jobs', 'update'), 'clients cannot mutate WhatsApp delivery jobs');
select ok(not has_function_privilege('authenticated', 'public.claim_whatsapp_outbox(text,integer,integer)', 'execute'), 'clients cannot claim WhatsApp jobs');
select ok(not has_function_privilege('authenticated', 'public.confirm_whatsapp_payment_action(text,text,text,text,text)', 'execute'), 'clients cannot bypass signed owner confirmation');
select ok(has_function_privilege('service_role', 'public.enqueue_whatsapp_intent(uuid,uuid,uuid,text,text,text,jsonb,timestamptz)', 'execute'), 'service role can atomically enqueue WhatsApp intents');
select has_function('public', 'complete_whatsapp_outbox_attempt', array['uuid','text','text','text','integer','text','text','timestamp with time zone'], 'outbox completion is one fenced transaction');
select has_function('public', 'finish_whatsapp_webhook', array['uuid','text','text','timestamp with time zone','text'], 'webhook completion is fenced by worker lease');
select has_function('public', 'apply_whatsapp_status', array['text','text','timestamp with time zone','jsonb'], 'provider delivery states use a monotonic projection');
select has_function('public', 'submit_whatsapp_upi_payment_evidence', array['uuid','uuid','text','timestamp with time zone','text','text','text','text'], 'WhatsApp evidence submission is atomic');
select has_function('public', 'update_whatsapp_maintenance_ticket', array['uuid','uuid','text','text'], 'owner maintenance actions use a scoped transaction');
select has_function('public', 'acknowledge_whatsapp_move_out_request', array['uuid','uuid','text'], 'owner move-out acknowledgement uses a scoped transaction');
select ok(
  not has_table_privilege('service_role', 'public.whatsapp_consent_events', 'update')
  and not has_table_privilege('service_role', 'public.whatsapp_delivery_attempts', 'update')
  and not has_table_privilege('service_role', 'public.whatsapp_status_events', 'update'),
  'consent, delivery-attempt and provider-status histories are append-only'
);
select ok(
  not has_function_privilege('anon', 'public.replay_whatsapp_dead_letter(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.replay_whatsapp_dead_letter(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.replay_whatsapp_dead_letter(uuid,uuid)', 'execute'),
  'only the trusted operator server can replay a safe dead letter'
);
select has_function('public', 'update_brand_theme', array['uuid','uuid','text','text'], 'audited brand theme update function exists');
select ok(
  not has_function_privilege('anon', 'public.update_brand_theme(uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.update_brand_theme(uuid,uuid,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.update_brand_theme(uuid,uuid,text,text)', 'execute'),
  'brand theme updates are reachable only through the server role'
);
select ok(not has_table_privilege('authenticated', 'public.rooms', 'update'), 'clients cannot directly change room records');
select has_table('public', 'invoice_payment_requests', 'secure invoice payment-request table exists');
select has_function('public', 'enforce_payment_request_upi_configuration', array[]::text[], 'payment links require property UPI configuration');
select ok(not has_table_privilege('anon', 'public.invoice_payment_requests', 'select'), 'anonymous users cannot enumerate payment links');
select ok(not has_table_privilege('authenticated', 'public.invoice_payment_requests', 'insert'), 'staff cannot directly create payment-link rows');
select ok(
  not has_function_privilege('anon', 'public.submit_public_upi_payment_evidence(text,uuid,bigint,text,timestamptz,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.submit_public_upi_payment_evidence(text,uuid,bigint,text,timestamptz,text,text,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.submit_public_upi_payment_evidence(text,uuid,bigint,text,timestamptz,text,text,text,text)', 'execute'),
  'only the trusted server can submit evidence through a public payment link'
);
select is(
  (
    select count(*)
    from public.template_versions
    where version = '1.0.0'
      and status = 'current'
      and contract @> '{"businessData":false,"demoRecords":0}'::jsonb
  ),
  1::bigint,
  'canonical blank template is current and contains no business records'
);
select has_table('public', 'provisioning_jobs', 'server-only provisioning jobs table exists');
select has_table('public', 'provisioning_steps', 'server-only provisioning steps table exists');
select has_table('public', 'platform_audit_events', 'platform deletion audit table exists');
select has_function(
  'public',
  'delete_empty_draft_organization',
  array['uuid','uuid','text'],
  'empty draft deletion RPC has the expected signature'
);
select ok(
  not has_function_privilege('anon', 'public.delete_empty_draft_organization(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.delete_empty_draft_organization(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.delete_empty_draft_organization(uuid,uuid,text)', 'execute'),
  'only the server role can invoke empty draft deletion'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'public.delete_empty_draft_organization(uuid,uuid,text)'::pg_catalog.regprocedure
  ) ilike '%organization.state = ''draft''%'
  and pg_catalog.pg_get_functiondef(
    'public.delete_empty_draft_organization(uuid,uuid,text)'::pg_catalog.regprocedure
  ) ilike '%not organization.demo_mode%'
  and pg_catalog.pg_get_functiondef(
    'public.delete_empty_draft_organization(uuid,uuid,text)'::pg_catalog.regprocedure
  ) ilike '%from auth.users%'
  and pg_catalog.pg_get_functiondef(
    'public.delete_empty_draft_organization(uuid,uuid,text)'::pg_catalog.regprocedure
  ) ilike '%organization.empty_draft_deleted%',
  'empty draft deletion is state-guarded, Auth-aware, and audited'
);
select has_table('public', 'auth_rate_limit_buckets', 'server-only authentication limiter table exists');
select ok(
  not has_table_privilege('anon', 'public.auth_rate_limit_buckets', 'select')
  and not has_table_privilege('authenticated', 'public.auth_rate_limit_buckets', 'select')
  and not has_table_privilege('service_role', 'public.auth_rate_limit_buckets', 'select'),
  'authentication limiter buckets are inaccessible to API roles'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'auth_rate_limit_buckets'
      and pg_class.relrowsecurity
  ),
  'authentication limiter has row-level security enabled'
);
select has_function(
  'public',
  'consume_auth_rate_limit',
  array['text', 'text', 'integer', 'integer'],
  'atomic authentication limiter function exists'
);
select ok(
  has_function_privilege('service_role', 'public.consume_auth_rate_limit(text,text,integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.consume_auth_rate_limit(text,text,integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_auth_rate_limit(text,text,integer,integer)', 'execute'),
  'only the server service role can consume authentication limits'
);
select ok(
  (select "allowed" from public.consume_auth_rate_limit(pg_catalog.repeat('a', 64), 'host_phone', 10, 900)),
  'the first authentication attempt is allowed'
);
do $rate_limit_attempts$
begin
  for attempt_number in 1..9 loop
    perform * from public.consume_auth_rate_limit(pg_catalog.repeat('a', 64), 'host_phone', 10, 900);
  end loop;
end;
$rate_limit_attempts$;
select ok(
  not (select "allowed" from public.consume_auth_rate_limit(pg_catalog.repeat('a', 64), 'host_phone', 10, 900)),
  'an authentication attempt beyond the bucket limit is denied'
);
select has_table('public', 'owner_password_recoveries', 'server-only owner recovery table exists');
select ok(
  not has_table_privilege('anon', 'public.owner_password_recoveries', 'select')
  and not has_table_privilege('authenticated', 'public.owner_password_recoveries', 'select')
  and has_table_privilege('service_role', 'public.owner_password_recoveries', 'select')
  and not has_table_privilege('service_role', 'public.owner_password_recoveries', 'insert')
  and not has_table_privilege('service_role', 'public.owner_password_recoveries', 'update'),
  'owner recovery records are readable only by the server and mutable only through guarded functions'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'owner_password_recoveries'
      and pg_class.relrowsecurity
  ),
  'owner recovery table has row-level security enabled'
);
select has_function('public', 'issue_owner_password_recovery', array['uuid', 'uuid', 'text', 'timestamp with time zone'], 'owner recovery issue function exists');
select has_function('public', 'claim_owner_password_recovery', array['uuid', 'text', 'text', 'uuid', 'text'], 'owner recovery claim function exists');
select has_function('public', 'complete_owner_password_recovery', array['uuid', 'uuid', 'uuid', 'text'], 'owner recovery completion function exists');
select ok(
  has_function_privilege('service_role', 'public.issue_owner_password_recovery(uuid,uuid,text,timestamp with time zone)', 'execute')
  and has_function_privilege('service_role', 'public.claim_owner_password_recovery(uuid,text,text,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.complete_owner_password_recovery(uuid,uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.claim_owner_password_recovery(uuid,text,text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_owner_password_recovery(uuid,uuid,uuid,text)', 'execute'),
  'only the service role can execute owner recovery functions'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_index
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    join pg_catalog.pg_class as table_relation
      on table_relation.oid = pg_index.indrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = table_relation.relnamespace
    where pg_namespace.nspname = 'public'
      and table_relation.relname = 'domain_mappings'
      and index_relation.relname = 'domain_mappings_one_platform_subdomain_uq'
      and pg_index.indisunique
      and pg_index.indpred is not null
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid),
        'platform_subdomain'
      ) > 0
  ),
  'an organization can have at most one platform subdomain mapping'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    join pg_catalog.pg_class
      on pg_class.oid = pg_constraint.conrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'domain_mappings'
      and pg_constraint.conname = 'domain_mappings_normalized_hostname_check'
      and pg_constraint.contype = 'c'
      and pg_constraint.convalidated
  ),
  'domain mappings have a validated canonical hostname constraint'
);
select ok(
  not exists (
    select 1
    from public.domain_mappings as domain_mapping
    where domain_mapping.hostname = 'pgflow-ruby.vercel.app'
  ),
  'the temporary Vercel hostname is no longer a tenant mapping'
);
select ok(
  exists (
    select 1
    from public.domain_mappings as domain_mapping
    join public.organizations as organization
      on organization.id = domain_mapping.organization_id
    where domain_mapping.hostname = organization.slug || '.pgflow.co'
      and domain_mapping.kind = 'platform_subdomain'
      and domain_mapping.state = 'verified'
      and domain_mapping.verified_at is not null
  ),
  'the bootstrap tenant uses its verified pgflow.co platform subdomain'
);
select ok(
  not has_table_privilege('anon', 'public.provisioning_jobs', 'select')
  and not has_table_privilege('anon', 'public.provisioning_jobs', 'insert')
  and not has_table_privilege('authenticated', 'public.provisioning_jobs', 'select')
  and not has_table_privilege('authenticated', 'public.provisioning_jobs', 'insert')
  and not has_table_privilege('anon', 'public.provisioning_steps', 'select')
  and not has_table_privilege('authenticated', 'public.provisioning_steps', 'select')
  and has_table_privilege('service_role', 'public.provisioning_jobs', 'select')
  and not has_table_privilege('service_role', 'public.provisioning_jobs', 'insert')
  and has_column_privilege('service_role', 'public.provisioning_jobs', 'state', 'update')
  and has_table_privilege('service_role', 'public.provisioning_steps', 'select')
  and not has_table_privilege('service_role', 'public.provisioning_steps', 'insert')
  and has_column_privilege('service_role', 'public.provisioning_steps', 'state', 'update')
  and (
    select bool_and(pg_class.relrowsecurity)
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in ('provisioning_jobs', 'provisioning_steps')
  )
  and not exists (
    select 1
    from pg_catalog.pg_policies
    where pg_policies.schemaname = 'public'
      and pg_policies.tablename in ('provisioning_jobs', 'provisioning_steps')
  ),
  'provisioning tables have RLS and no client grants or policies'
);
select has_function(
  'public',
  'provision_organization_core',
  array['uuid','text','text','text','text','text','text','text','text'],
  'core provisioning RPC has the expected signature'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.provision_organization_core(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.provision_organization_core(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.provision_organization_core(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  ),
  'only service_role can execute core provisioning'
);
select has_table('public', 'staff_invitations', 'server-only staff invitations table exists');
select ok(
  not has_table_privilege('anon', 'public.staff_invitations', 'select')
  and not has_table_privilege('authenticated', 'public.staff_invitations', 'select')
  and has_table_privilege('service_role', 'public.staff_invitations', 'select')
  and not has_table_privilege('service_role', 'public.staff_invitations', 'insert')
  and not has_table_privilege('service_role', 'public.staff_invitations', 'update')
  and not has_table_privilege('service_role', 'public.staff_invitations', 'delete')
  and (
    select pg_class.relrowsecurity
    from pg_catalog.pg_class
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'staff_invitations'
  )
  and not exists (
    select 1
    from pg_catalog.pg_policies
    where pg_policies.schemaname = 'public'
      and pg_policies.tablename = 'staff_invitations'
  ),
  'staff invitations have RLS, no client access, and read-only service inspection'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_index
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    join pg_catalog.pg_class as table_relation
      on table_relation.oid = pg_index.indrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = table_relation.relnamespace
    where pg_namespace.nspname = 'public'
      and table_relation.relname = 'staff_invitations'
      and index_relation.relname = 'staff_invitations_one_pending_owner_per_org_uq'
      and pg_index.indisunique
      and pg_index.indpred is not null
      and pg_catalog.strpos(pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid), 'owner') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid), 'pending') > 0
  ),
  'only one pending owner invitation can exist per organization'
);
select ok(
  (
    select count(*) = 4
    from pg_catalog.pg_constraint
    join pg_catalog.pg_class
      on pg_class.oid = pg_constraint.conrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'staff_invitations'
      and pg_constraint.contype = 'c'
      and pg_constraint.convalidated
      and pg_constraint.conname in (
        'staff_invitations_indian_phone_check',
        'staff_invitations_token_hash_check',
        'staff_invitations_short_expiry_check',
        'staff_invitations_state_consistency_check'
      )
  ),
  'owner invitation phone, token, expiry, and state checks are validated'
);
select has_function(
  'public',
  'create_owner_invitation',
  array['uuid','uuid','uuid','text','text','text','timestamp with time zone'],
  'owner invitation RPC has the expected signature'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_owner_invitation(uuid,uuid,uuid,text,text,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.create_owner_invitation(uuid,uuid,uuid,text,text,text,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.create_owner_invitation(uuid,uuid,uuid,text,text,text,timestamptz)',
    'execute'
  ),
  'only service_role can execute owner invitation creation'
);

select ok(
  (
    select count(*) = 9
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_invitations'
      and column_name in (
        'activation_auth_user_id',
        'activation_request_id',
        'auth_user_id',
        'credential_state',
        'credential_issued_at',
        'temporary_password_hash',
        'temporary_password_expires_at',
        'manual_phone_confirmed_at',
        'manual_phone_confirmed_by'
      )
  )
  and (
    select count(*) = 2
    from pg_catalog.pg_constraint
    join pg_catalog.pg_class
      on pg_class.oid = pg_constraint.conrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname = 'staff_invitations'
      and pg_constraint.contype = 'c'
      and pg_constraint.convalidated
      and pg_constraint.conname in (
        'staff_invitations_credential_state_check',
        'staff_invitations_manual_credential_consistency_check'
      )
  )
  and exists (
    select 1
    from pg_catalog.pg_index
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    join pg_catalog.pg_class as table_relation
      on table_relation.oid = pg_index.indrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = table_relation.relnamespace
    where pg_namespace.nspname = 'public'
      and table_relation.relname = 'staff_invitations'
      and index_relation.relname = 'staff_invitations_activation_auth_user_id_uq'
      and pg_index.indisunique
  )
  and exists (
    select 1
    from pg_catalog.pg_trigger
    join pg_catalog.pg_class
      on pg_class.oid = pg_trigger.tgrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'auth'
      and pg_class.relname = 'users'
      and pg_trigger.tgname = 'auth_user_complete_manual_owner_activation'
      and not pg_trigger.tgisinternal
      and pg_catalog.pg_get_triggerdef(pg_trigger.oid) ilike
        '%AFTER INSERT OR UPDATE OF phone, phone_confirmed_at, raw_app_meta_data ON auth.users%'
  ),
  'manual credential IDs, consistency checks, stable-ID uniqueness, and guarded Auth trigger exist'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_index
    join pg_catalog.pg_class as index_relation
      on index_relation.oid = pg_index.indexrelid
    join pg_catalog.pg_class as table_relation
      on table_relation.oid = pg_index.indrelid
    join pg_catalog.pg_namespace
      on pg_namespace.oid = table_relation.relnamespace
    where pg_namespace.nspname = 'public'
      and table_relation.relname = 'memberships'
      and index_relation.relname = 'memberships_one_current_owner_per_org_uq'
      and pg_index.indisunique
      and pg_index.indpred is not null
      and pg_catalog.strpos(pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid), 'owner') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid), 'invited') > 0
      and pg_catalog.strpos(pg_catalog.pg_get_expr(pg_index.indpred, pg_index.indrelid), 'active') > 0
  ),
  'a PG organization has at most one current owner authority'
);

select has_function(
  'public',
  'issue_manual_owner_credential',
  array['uuid','uuid','text','timestamp with time zone'],
  'manual owner credential issuance RPC has the expected signature'
);

select has_function(
  'public',
  'reset_manual_owner_credential',
  array['uuid','uuid','uuid','text','timestamp with time zone'],
  'manual owner credential reset RPC has the expected signature'
);

select has_function(
  'public',
  'complete_manual_owner_activation',
  array['uuid','uuid','uuid','uuid'],
  'manual owner activation RPC has the expected signature'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.issue_manual_owner_credential(uuid,uuid,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.issue_manual_owner_credential(uuid,uuid,text,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.issue_manual_owner_credential(uuid,uuid,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.reset_manual_owner_credential(uuid,uuid,uuid,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reset_manual_owner_credential(uuid,uuid,uuid,text,timestamptz)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.reset_manual_owner_credential(uuid,uuid,uuid,text,timestamptz)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.complete_manual_owner_activation(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.complete_manual_owner_activation(uuid,uuid,uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.complete_manual_owner_activation(uuid,uuid,uuid,uuid)',
    'execute'
  ),
  'service_role can issue and reset credentials while completion remains trigger-only'
);

insert into auth.users (id, aud, role, email)
values
  ('a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'manager-a@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'accountant-a@example.test'),
  ('a0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'tenant-a@example.test'),
  ('a0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'tenant-a2@example.test'),
  ('b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'owner-b@example.test'),
  ('b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'tenant-b@example.test'),
  ('d0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'disabled@example.test'),
  ('c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'invited@example.test');

insert into public.platform_operators (auth_user_id, display_name, state)
values ('a0000000-0000-0000-0000-000000000001', 'Provisioning Operator', 'active');

insert into public.organizations (id, name, slug, template_version_id, state, resident_limit)
values
  ('aa000000-0000-0000-0000-000000000001', 'Organization A', 'organization-a', (select id from public.template_versions where version = '1.0.0'), 'live', 10),
  ('bb000000-0000-0000-0000-000000000001', 'Organization B', 'organization-b', (select id from public.template_versions where version = '1.0.0'), 'live', 10);

select lives_ok(
  $valid_hostnames$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values
      ('aa000000-0000-0000-0000-000000000001', 'aster-test-house.localhost', 'custom'),
      ('aa000000-0000-0000-0000-000000000001', 'localhost', 'custom'),
      ('bb000000-0000-0000-0000-000000000001', 'xn--bcher-kva.example', 'custom')
  $valid_hostnames$,
  'canonical local, single-label, and punycode hostnames are accepted'
);

select throws_ok(
  $comma_hostname$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values ('aa000000-0000-0000-0000-000000000001', 'aster-test-house.localhost,evil.example', 'custom')
  $comma_hostname$,
  '23514',
  'new row for relation "domain_mappings" violates check constraint "domain_mappings_normalized_hostname_check"',
  'a comma-delimited hostname is rejected'
);

select throws_ok(
  $leading_hyphen_hostname$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values ('aa000000-0000-0000-0000-000000000001', '-leading.example', 'custom')
  $leading_hyphen_hostname$,
  '23514',
  'new row for relation "domain_mappings" violates check constraint "domain_mappings_normalized_hostname_check"',
  'a label with a leading hyphen is rejected'
);

select throws_ok(
  $trailing_hyphen_hostname$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values ('aa000000-0000-0000-0000-000000000001', 'trailing-.example', 'custom')
  $trailing_hyphen_hostname$,
  '23514',
  'new row for relation "domain_mappings" violates check constraint "domain_mappings_normalized_hostname_check"',
  'a label with a trailing hyphen is rejected'
);

select throws_ok(
  $empty_hostname_label$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values ('aa000000-0000-0000-0000-000000000001', 'double..dot.example', 'custom')
  $empty_hostname_label$,
  '23514',
  'new row for relation "domain_mappings" violates check constraint "domain_mappings_normalized_hostname_check"',
  'an empty hostname label is rejected'
);

select throws_ok(
  $long_hostname_label$
    insert into public.domain_mappings (organization_id, hostname, kind)
    values (
      'aa000000-0000-0000-0000-000000000001',
      pg_catalog.repeat('a', 64) || '.example',
      'custom'
    )
  $long_hostname_label$,
  '23514',
  'new row for relation "domain_mappings" violates check constraint "domain_mappings_normalized_hostname_check"',
  'a hostname label longer than 63 characters is rejected'
);

insert into public.properties (id, organization_id, name)
values
  ('aa100000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Property A'),
  ('bb100000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'Property B');

insert into public.memberships (id, organization_id, property_id, auth_user_id, phone, display_name, role, state)
values
  ('aa110000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '+910000000001', 'Owner A', 'owner', 'active'),
  ('aa110000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', '+910000000002', 'Manager A', 'manager', 'active'),
  ('aa110000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '+910000000003', 'Accountant A', 'accountant', 'active'),
  ('aa110000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '+910000000004', 'Tenant A', 'tenant', 'active'),
  ('aa110000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', '+910000000005', 'Tenant A2', 'tenant', 'active'),
  ('bb110000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '+910000000006', 'Owner B', 'owner', 'active'),
  ('bb110000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', '+910000000007', 'Tenant B', 'tenant', 'active'),
  ('aa110000-0000-0000-0000-000000000008', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '+910000000008', 'Disabled A', 'tenant', 'disabled'),
  ('aa110000-0000-0000-0000-000000000009', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '+910000000009', 'Invited A', 'tenant', 'invited');

insert into public.brand_themes (organization_id, app_name, short_name)
values
  ('aa000000-0000-0000-0000-000000000001', 'Brand A', 'A'),
  ('bb000000-0000-0000-0000-000000000001', 'Brand B', 'B');

insert into public.rooms (id, organization_id, property_id, floor_name, code, capacity, default_rent)
values
  ('aa300000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', '1', 'A-101', 2, 800000),
  ('bb300000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', '1', 'B-101', 2, 900000);

insert into public.tenant_profiles (id, organization_id, property_id, membership_id, full_name, phone)
values
  ('aa200000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa110000-0000-0000-0000-000000000004', 'Tenant A', '+910000000004'),
  ('aa200000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa110000-0000-0000-0000-000000000005', 'Tenant A2', '+910000000005'),
  ('bb200000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'bb110000-0000-0000-0000-000000000002', 'Tenant B', '+910000000007'),
  ('aa200000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa110000-0000-0000-0000-000000000008', 'Disabled A', '+910000000008'),
  ('aa200000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa110000-0000-0000-0000-000000000009', 'Invited A', '+910000000009');

insert into public.invoices (id, organization_id, property_id, tenant_id, period, number, due_date, total_amount, state)
values
  ('aa400000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa200000-0000-0000-0000-000000000001', '2026-07', 'A-2026-07-001', '2026-07-05', 800000, 'issued'),
  ('aa400000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', 'aa100000-0000-0000-0000-000000000001', 'aa200000-0000-0000-0000-000000000002', '2026-07', 'A-2026-07-002', '2026-07-05', 800000, 'issued'),
  ('bb400000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-000000000001', 'bb100000-0000-0000-0000-000000000001', 'bb200000-0000-0000-0000-000000000001', '2026-07', 'B-2026-07-001', '2026-07-05', 900000, 'issued');

create temporary table provisioning_test_results (
  auth_users_before bigint not null,
  first_result jsonb,
  replay_result jsonb
) on commit drop;

insert into provisioning_test_results (auth_users_before)
select count(*) from auth.users;

update provisioning_test_results
set first_result = public.provision_organization_core(
  'a0000000-0000-0000-0000-000000000001',
  '1.0.0',
  'Provisioning Test',
  'provisioning-test',
  'provisioning-test.example.test',
  'Main Property',
  '#112233',
  '#aabbcc',
  repeat('1', 64)
);

update provisioning_test_results
set replay_result = public.provision_organization_core(
  'a0000000-0000-0000-0000-000000000001',
  '1.0.0',
  'Provisioning Test',
  'provisioning-test',
  'provisioning-test.example.test',
  'Main Property',
  '#112233',
  '#aabbcc',
  repeat('1', 64)
);

select ok(
  first_result->>'idempotentReplay' = 'false'
  and replay_result->>'idempotentReplay' = 'true'
  and first_result - 'idempotentReplay' = replay_result - 'idempotentReplay'
  and first_result->>'jobId' = replay_result->>'jobId'
  and first_result->>'organizationId' = replay_result->>'organizationId'
  and first_result->>'propertyId' = replay_result->>'propertyId'
  and first_result->>'brandThemeId' = replay_result->>'brandThemeId'
  and first_result->>'domainMappingId' = replay_result->>'domainMappingId'
  and first_result->>'organizationName' = 'Provisioning Test'
  and first_result->>'organizationSlug' = 'provisioning-test'
  and first_result->>'propertyName' = 'Main Property'
  and first_result->>'hostname' = 'provisioning-test.example.test'
  and first_result->>'templateVersion' = '1.0.0'
  and first_result->>'state' = 'awaiting_data',
  'core provisioning replays the same persisted result'
)
from provisioning_test_results;

select throws_ok(
  $idempotency_conflict$
    select public.provision_organization_core(
      'a0000000-0000-0000-0000-000000000001',
      '1.0.0',
      'Provisioning Conflict',
      'provisioning-test',
      'provisioning-test.example.test',
      'Main Property',
      '#112233',
      '#aabbcc',
      repeat('1', 64)
    )
  $idempotency_conflict$,
  'P0001',
  'The idempotency hash conflicts with an existing provisioning request.',
  'reusing an idempotency hash for a different normalized request fails'
);

select ok(
  (
    select count(*) = 1
    from public.organizations
    where organizations.id = (first_result->>'organizationId')::uuid
      and organizations.state = 'draft'
      and not organizations.demo_mode
  )
  and (
    select count(*) = 1
    from public.properties
    where properties.id = (first_result->>'propertyId')::uuid
      and properties.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 1
    from public.brand_themes
    where brand_themes.id = (first_result->>'brandThemeId')::uuid
      and brand_themes.organization_id = (first_result->>'organizationId')::uuid
      and brand_themes.primary_color = '#112233'
      and brand_themes.accent_color = '#aabbcc'
  )
  and (
    select count(*) = 1
    from public.domain_mappings
    where domain_mappings.id = (first_result->>'domainMappingId')::uuid
      and domain_mappings.organization_id = (first_result->>'organizationId')::uuid
      and domain_mappings.kind = 'platform_subdomain'
      and domain_mappings.state = 'verified'
  )
  and (
    select count(*) = 1
    from public.provisioning_jobs
    where provisioning_jobs.id = (first_result->>'jobId')::uuid
      and provisioning_jobs.organization_id = (first_result->>'organizationId')::uuid
      and provisioning_jobs.state = 'awaiting_data'
      and provisioning_jobs.request_fingerprint = '{
        "templateVersion": "1.0.0",
        "organizationName": "Provisioning Test",
        "organizationSlug": "provisioning-test",
        "hostname": "provisioning-test.example.test",
        "propertyName": "Main Property",
        "primaryColor": "#112233",
        "accentColor": "#aabbcc"
      }'::jsonb
  ),
  'first provisioning call creates exactly one empty organization core'
)
from provisioning_test_results;

select is(
  (
    select jsonb_agg(
      jsonb_build_array(provisioning_steps.key, provisioning_steps.state)
      order by provisioning_steps.sort_order
    )
    from public.provisioning_steps
    where provisioning_steps.job_id = (first_result->>'jobId')::uuid
  ),
  '[
    ["organization", "passed"],
    ["branding", "passed"],
    ["property_data", "passed"],
    ["owner_account", "pending"],
    ["upi_and_rules", "pending"],
    ["storage_namespace", "pending"],
    ["authorization_smoke_test", "pending"],
    ["billing_preview", "pending"],
    ["pwa_manifest", "pending"]
  ]'::jsonb,
  'core provisioning creates the ordered passed and pending steps'
)
from provisioning_test_results;

select ok(
  (select count(*) from auth.users) = auth_users_before
  and (
    select count(*) = 0
    from public.memberships
    where memberships.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.rooms
    where rooms.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.beds
    where beds.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.tenant_profiles
    where tenant_profiles.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.occupancies
    where occupancies.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.invoices
    where invoices.organization_id = (first_result->>'organizationId')::uuid
  )
  and (
    select count(*) = 0
    from public.payments
    where payments.organization_id = (first_result->>'organizationId')::uuid
  ),
  'core provisioning creates no auth user, membership, room, tenant, invoice, or payment data'
)
from provisioning_test_results;

select is(
  (
    select count(*)
    from public.audit_events
    where audit_events.organization_id = (first_result->>'organizationId')::uuid
      and audit_events.actor_id = 'a0000000-0000-0000-0000-000000000001'
      and audit_events.action = 'provisioning.core_created'
      and audit_events.entity_id = first_result->>'jobId'
  ),
  1::bigint,
  'first provisioning call writes one audit event and replay writes none'
)
from provisioning_test_results;

select throws_ok(
  $invalid_owner_phone$
    select public.create_owner_invitation(
      'a0000000-0000-0000-0000-000000000001',
      (select (first_result->>'organizationId')::uuid from provisioning_test_results),
      (select (first_result->>'propertyId')::uuid from provisioning_test_results),
      'Test Owner',
      '+911234567890',
      pg_catalog.repeat('a', 64),
      pg_catalog.clock_timestamp() + interval '30 minutes'
    )
  $invalid_owner_phone$,
  '22023',
  'A valid Indian E.164 mobile number is required.',
  'owner invitations reject non-mobile Indian phone numbers'
);

select throws_ok(
  $inactive_operator$
    select public.create_owner_invitation(
      'b0000000-0000-0000-0000-000000000001',
      (select (first_result->>'organizationId')::uuid from provisioning_test_results),
      (select (first_result->>'propertyId')::uuid from provisioning_test_results),
      'Test Owner',
      '+919876543210',
      pg_catalog.repeat('a', 64),
      pg_catalog.clock_timestamp() + interval '30 minutes'
    )
  $inactive_operator$,
  '42501',
  'An active platform operator is required.',
  'owner invitations require an active platform operator'
);

select throws_ok(
  $live_organization$
    select public.create_owner_invitation(
      'a0000000-0000-0000-0000-000000000001',
      'aa000000-0000-0000-0000-000000000001',
      'aa100000-0000-0000-0000-000000000001',
      'Test Owner',
      '+919876543210',
      pg_catalog.repeat('a', 64),
      pg_catalog.clock_timestamp() + interval '30 minutes'
    )
  $live_organization$,
  '22023',
  'Owner invitations require a non-demo draft organization.',
  'owner invitations cannot stage against a live organization'
);

select throws_ok(
  $cross_organization_property$
    select public.create_owner_invitation(
      'a0000000-0000-0000-0000-000000000001',
      (select (first_result->>'organizationId')::uuid from provisioning_test_results),
      'bb100000-0000-0000-0000-000000000001',
      'Test Owner',
      '+919876543210',
      pg_catalog.repeat('a', 64),
      pg_catalog.clock_timestamp() + interval '30 minutes'
    )
  $cross_organization_property$,
  '22023',
  'The property does not belong to the organization.',
  'owner invitations reject a property from another organization'
);

create temporary table owner_invitation_test_results (
  auth_users_before bigint not null,
  memberships_before bigint not null,
  first_result jsonb,
  first_credential_result jsonb,
  replacement_result jsonb
) on commit drop;

insert into owner_invitation_test_results (auth_users_before, memberships_before)
select
  (select count(*) from auth.users),
  (select count(*) from public.memberships);

update owner_invitation_test_results
set first_result = public.create_owner_invitation(
  'a0000000-0000-0000-0000-000000000001',
  (select (first_result->>'organizationId')::uuid from provisioning_test_results),
  (select (first_result->>'propertyId')::uuid from provisioning_test_results),
  'First Owner',
  '+919876543210',
  pg_catalog.repeat('a', 64),
  pg_catalog.clock_timestamp() + interval '30 minutes'
);

update owner_invitation_test_results
set first_credential_result = public.issue_manual_owner_credential(
  'a0000000-0000-0000-0000-000000000001',
  (first_result->>'invitationId')::uuid,
  pg_catalog.repeat('e', 64),
  pg_catalog.clock_timestamp() + interval '20 minutes'
);

update owner_invitation_test_results
set replacement_result = public.create_owner_invitation(
  'a0000000-0000-0000-0000-000000000001',
  (select (first_result->>'organizationId')::uuid from provisioning_test_results),
  (select (first_result->>'propertyId')::uuid from provisioning_test_results),
  'Replacement Owner',
  '+919876543211',
  pg_catalog.repeat('b', 64),
  pg_catalog.clock_timestamp() + interval '30 minutes'
);

select ok(
  first_result->>'organizationId' = (
    select first_result->>'organizationId' from provisioning_test_results
  )
  and first_result->>'propertyId' = (
    select first_result->>'propertyId' from provisioning_test_results
  )
  and first_result->>'state' = 'pending'
  and first_result->>'displayName' = 'First Owner'
  and first_result->>'phone' = '+919876543210'
  and first_result ? 'invitationId'
  and first_result ? 'expiresAt',
  'owner invitation creation returns only persisted staging details'
)
from owner_invitation_test_results;

select ok(
  (
    select count(*) = 1
    from public.staff_invitations
    where staff_invitations.id = (first_result->>'invitationId')::uuid
      and staff_invitations.state = 'revoked'
      and staff_invitations.revoked_by = 'a0000000-0000-0000-0000-000000000001'
      and staff_invitations.revoked_at is not null
      and staff_invitations.credential_state = 'not_issued'
      and staff_invitations.credential_issued_at is null
      and staff_invitations.temporary_password_hash is null
      and staff_invitations.temporary_password_expires_at is null
      and staff_invitations.manual_phone_confirmed_at is null
      and staff_invitations.manual_phone_confirmed_by is null
  )
  and (
    select count(*) = 1
    from public.staff_invitations
    where staff_invitations.id = (replacement_result->>'invitationId')::uuid
      and staff_invitations.state = 'pending'
      and staff_invitations.role = 'owner'
  )
  and (
    select count(*) = 1
    from public.staff_invitations
    where staff_invitations.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and staff_invitations.role = 'owner'
      and staff_invitations.state = 'pending'
  ),
  'replacement revokes and clears the prior manual credential before leaving one pending invite'
)
from owner_invitation_test_results;

select ok(
  (select count(*) from auth.users) = auth_users_before
  and (select count(*) from public.memberships) = memberships_before
  and (
    select count(*) = 1
    from public.provisioning_steps
    where provisioning_steps.job_id = (
      select (first_result->>'jobId')::uuid from provisioning_test_results
    )
      and provisioning_steps.key = 'owner_account'
      and provisioning_steps.state = 'pending'
  ),
  'owner invitation staging creates no Auth user or membership and does not pass owner setup'
)
from owner_invitation_test_results;

select ok(
  (
    select count(*) = 2
    from public.audit_events
    where audit_events.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and audit_events.action = 'owner_invitation.created'
      and audit_events.entity_type = 'staff_invitation'
      and not audit_events.after_data ? 'tokenHash'
      and not audit_events.after_data ? 'token_hash'
      and pg_catalog.strpos(audit_events.after_data::text, pg_catalog.repeat('a', 64)) = 0
      and pg_catalog.strpos(audit_events.after_data::text, pg_catalog.repeat('b', 64)) = 0
  )
  and (
    select after_data->>'replacedInvitationId' = first_result->>'invitationId'
    from public.audit_events
    where audit_events.entity_id = replacement_result->>'invitationId'
  ),
  'owner invitation audit records omit token material and identify replacement'
)
from owner_invitation_test_results;

create temporary table manual_owner_activation_results (
  auth_users_before bigint not null,
  memberships_before bigint not null,
  issued_hash text not null,
  reset_hash text not null,
  issue_expiry timestamptz not null,
  reset_expiry timestamptz not null,
  activation_request_id uuid not null default 'f0000000-0000-4000-8000-000000000001',
  unconfirmed_pending boolean not null default false,
  issue_result jsonb,
  replay_result jsonb,
  reset_result jsonb,
  complete_result jsonb
) on commit drop;

insert into manual_owner_activation_results (
  auth_users_before,
  memberships_before,
  issued_hash,
  reset_hash,
  issue_expiry,
  reset_expiry
)
select
  (select count(*) from auth.users),
  (select count(*) from public.memberships),
  pg_catalog.repeat('c', 64),
  pg_catalog.repeat('d', 64),
  pg_catalog.clock_timestamp() + interval '23 hours',
  pg_catalog.clock_timestamp() + interval '12 hours';

select throws_ok(
  $invalid_manual_credential_hash$
    select public.issue_manual_owner_credential(
      'a0000000-0000-0000-0000-000000000001',
      (select (replacement_result->>'invitationId')::uuid from owner_invitation_test_results),
      'not-a-sha256-digest',
      pg_catalog.clock_timestamp() + interval '12 hours'
    )
  $invalid_manual_credential_hash$,
  '22023',
  'A lowercase SHA-256 temporary credential hash is required.',
  'manual owner issuance rejects non-SHA-256 credential material'
);

update manual_owner_activation_results
set issue_result = public.issue_manual_owner_credential(
  'a0000000-0000-0000-0000-000000000001',
  (select (replacement_result->>'invitationId')::uuid from owner_invitation_test_results),
  issued_hash,
  issue_expiry
);

select ok(
  issue_result->>'invitationId' = (
    select replacement_result->>'invitationId' from owner_invitation_test_results
  )
  and issue_result->>'organizationId' = (
    select first_result->>'organizationId' from provisioning_test_results
  )
  and issue_result->>'propertyId' = (
    select first_result->>'propertyId' from provisioning_test_results
  )
  and issue_result->>'credentialState' = 'temporary'
  and issue_result ? 'activationAuthUserId'
  and (issue_result->>'activationAuthUserId')::uuid is not null
  and issue_result ? 'temporaryPasswordExpiresAt'
  and not issue_result ? 'temporaryPasswordHash'
  and not issue_result ? 'activationRequestId'
  and not issue_result ? 'authUserId'
  and not issue_result ? 'membershipId',
  'manual credential issuance returns only safe persisted metadata'
)
from manual_owner_activation_results;

select ok(
  (select count(*) from auth.users) = auth_users_before
  and (select count(*) from public.memberships) = memberships_before
  and (
    select count(*) = 1
    from public.staff_invitations as invitation
    where invitation.id = (issue_result->>'invitationId')::uuid
      and invitation.state = 'pending'
      and invitation.credential_state = 'temporary'
      and invitation.activation_auth_user_id = (issue_result->>'activationAuthUserId')::uuid
      and invitation.activation_request_id is null
      and invitation.auth_user_id is null
      and invitation.temporary_password_hash = issued_hash
      and invitation.temporary_password_expires_at = issue_expiry
      and invitation.manual_phone_confirmed_at is not null
      and invitation.manual_phone_confirmed_by = 'a0000000-0000-0000-0000-000000000001'
  )
  and (
    select count(*) = 0
    from public.memberships as membership
    where membership.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and membership.role = 'owner'
  ),
  'issuing a temporary credential creates no Auth binding or membership authority'
)
from manual_owner_activation_results;

update manual_owner_activation_results
set replay_result = public.issue_manual_owner_credential(
  'a0000000-0000-0000-0000-000000000001',
  (select (replacement_result->>'invitationId')::uuid from owner_invitation_test_results),
  issued_hash,
  issue_expiry
);

select ok(
  replay_result = issue_result
  and replay_result->>'activationAuthUserId' = issue_result->>'activationAuthUserId'
  and (
    select count(*) = 1
    from public.audit_events as audit_event
    where audit_event.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and audit_event.action = 'owner_credential.issued'
      and audit_event.entity_id = issue_result->>'invitationId'
  ),
  'an exact credential issuance retry is idempotent and does not duplicate audit events'
)
from manual_owner_activation_results;

-- The staging invitation link has now expired. Once issued, the dedicated
-- manual credential expiry is authoritative, so an operator may still rotate
-- that temporary credential through the audited reset path.
update public.staff_invitations as invitation
set
  created_at = invitation.created_at - interval '1 hour',
  expires_at = pg_catalog.clock_timestamp() - interval '1 minute'
where invitation.id = (
  select (issue_result->>'invitationId')::uuid
  from manual_owner_activation_results
);

update manual_owner_activation_results
set reset_result = public.reset_manual_owner_credential(
  'a0000000-0000-0000-0000-000000000001',
  (select (first_result->>'organizationId')::uuid from provisioning_test_results),
  (issue_result->>'activationAuthUserId')::uuid,
  reset_hash,
  reset_expiry
);

select ok(
  reset_result->>'invitationId' = issue_result->>'invitationId'
  and reset_result->>'credentialState' = 'temporary'
  and reset_result ? 'activationAuthUserId'
  and reset_result->>'activationAuthUserId' <> issue_result->>'activationAuthUserId'
  and not reset_result ? 'temporaryPasswordHash'
  and not reset_result ? 'activationRequestId'
  and (select count(*) from auth.users) = auth_users_before
  and (select count(*) from public.memberships) = memberships_before
  and (
    select count(*) = 1
    from public.staff_invitations as invitation
    where invitation.id = (reset_result->>'invitationId')::uuid
      and invitation.temporary_password_hash = reset_hash
      and invitation.temporary_password_hash <> issued_hash
      and invitation.temporary_password_expires_at = reset_expiry
      and invitation.activation_auth_user_id = (reset_result->>'activationAuthUserId')::uuid
      and invitation.activation_request_id is null
      and invitation.auth_user_id is null
      and invitation.expires_at < pg_catalog.clock_timestamp()
  ),
  'manual credential reset rotates the stable Auth ID, digest, and authoritative expiry after staging expiry'
)
from manual_owner_activation_results;

select ok(
  (
    select count(*) = 2
    from public.audit_events as audit_event
    where audit_event.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and audit_event.action in ('owner_credential.issued', 'owner_credential.reset')
      and audit_event.entity_id = issue_result->>'invitationId'
      and not audit_event.after_data ? 'temporaryPasswordHash'
      and not audit_event.after_data ? 'temporary_password_hash'
      and pg_catalog.strpos(audit_event.after_data::text, issued_hash) = 0
      and pg_catalog.strpos(audit_event.after_data::text, reset_hash) = 0
  ),
  'credential issuance and reset audit records contain no credential digest'
)
from manual_owner_activation_results;

select throws_ok(
  $mismatched_manual_owner_phone$
    insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_app_meta_data)
    select
      (activation_result.reset_result->>'activationAuthUserId')::uuid,
      'authenticated',
      'authenticated',
      '+919876543299',
      pg_catalog.clock_timestamp(),
      pg_catalog.jsonb_build_object(
        'pgflow_activation', 'manual_owner',
        'pgflow_invitation_id', invitation_result.replacement_result->>'invitationId',
        'pgflow_organization_id', provisioning_result.first_result->>'organizationId',
        'pgflow_phone_confirmation', 'manual_operator',
        'pgflow_activation_request_id', activation_result.activation_request_id::text
      )
    from manual_owner_activation_results as activation_result
    cross join owner_invitation_test_results as invitation_result
    cross join provisioning_test_results as provisioning_result
  $mismatched_manual_owner_phone$,
  '22023',
  'The Auth user must match the manually confirmed owner activation record.',
  'the guarded Auth trigger atomically rejects a confirmed user whose phone differs from the invitation'
);

-- GoTrue may INSERT the metadata-bearing user before it writes phone_confirmed_at
-- and may persist canonical E.164 without the optional leading plus sign.
-- The INSERT trigger waits without granting authority; the targeted UPDATE
-- trigger then completes every authority write in the same transaction.
insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_app_meta_data)
select
  (activation_result.reset_result->>'activationAuthUserId')::uuid,
  'authenticated',
  'authenticated',
  pg_catalog.ltrim(invitation.phone, '+'),
  null,
  pg_catalog.jsonb_build_object(
    'pgflow_activation', 'manual_owner',
    'pgflow_invitation_id', invitation.id::text,
    'pgflow_organization_id', invitation.organization_id::text,
    'pgflow_phone_confirmation', 'manual_operator',
    'pgflow_activation_request_id', activation_result.activation_request_id::text
  )
from manual_owner_activation_results as activation_result
join public.staff_invitations as invitation
  on invitation.id = (activation_result.reset_result->>'invitationId')::uuid;

update manual_owner_activation_results as activation_result
set unconfirmed_pending =
  exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = (activation_result.reset_result->>'activationAuthUserId')::uuid
      and auth_user.phone_confirmed_at is null
  )
  and exists (
    select 1
    from public.staff_invitations as invitation
    where invitation.id = (activation_result.reset_result->>'invitationId')::uuid
      and invitation.state = 'pending'
      and invitation.credential_state = 'temporary'
      and invitation.activation_request_id is null
      and invitation.auth_user_id is null
  )
  and not exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and membership.role = 'owner'
  );

update auth.users as auth_user
set phone_confirmed_at = pg_catalog.clock_timestamp()
from manual_owner_activation_results as activation_result
where auth_user.id = (activation_result.reset_result->>'activationAuthUserId')::uuid;

update manual_owner_activation_results as activation_result
set complete_result = (
  select pg_catalog.jsonb_build_object(
    'invitationId', invitation.id,
    'membershipId', membership.id,
    'organizationId', invitation.organization_id,
    'activationRequestId', invitation.activation_request_id,
    'credentialState', invitation.credential_state,
    'membershipState', membership.state
  )
  from public.staff_invitations as invitation
  join public.memberships as membership
    on membership.organization_id = invitation.organization_id
    and membership.auth_user_id = invitation.auth_user_id
    and membership.role = 'owner'
  where invitation.id = (activation_result.reset_result->>'invitationId')::uuid
);

select ok(
  unconfirmed_pending
  and complete_result->>'invitationId' = issue_result->>'invitationId'
  and complete_result->>'organizationId' = (
    select first_result->>'organizationId' from provisioning_test_results
  )
  and complete_result->>'activationRequestId' = activation_request_id::text
  and complete_result->>'credentialState' = 'activated'
  and complete_result->>'membershipState' = 'active'
  and complete_result ? 'membershipId'
  and (
    select count(*) = 1
    from public.memberships as membership
    where membership.id = (complete_result->>'membershipId')::uuid
      and membership.organization_id = (
        select (first_result->>'organizationId')::uuid from provisioning_test_results
      )
      and membership.auth_user_id = (reset_result->>'activationAuthUserId')::uuid
      and membership.role = 'owner'
      and membership.state = 'active'
  )
  and (
    select count(*) = 0
    from public.memberships as membership
    where membership.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and membership.role = 'owner'
      and membership.state = 'invited'
  )
  and (
    select count(*) = 1
    from public.staff_invitations as invitation
    where invitation.id = (complete_result->>'invitationId')::uuid
      and invitation.state = 'accepted'
      and invitation.accepted_by = (reset_result->>'activationAuthUserId')::uuid
      and invitation.activation_auth_user_id = (reset_result->>'activationAuthUserId')::uuid
      and invitation.activation_request_id = activation_request_id
      and invitation.auth_user_id = (reset_result->>'activationAuthUserId')::uuid
      and invitation.credential_state = 'activated'
      and invitation.temporary_password_hash is null
      and invitation.temporary_password_expires_at is null
  )
  and (
    select count(*) = 1
    from public.provisioning_steps as provisioning_step
    where provisioning_step.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and provisioning_step.key = 'owner_account'
      and provisioning_step.state = 'passed'
      and provisioning_step.started_at is not null
      and provisioning_step.finished_at is not null
  )
  and (
    select count(*) = 1
    from public.audit_events as audit_event
    where audit_event.organization_id = (
      select (first_result->>'organizationId')::uuid from provisioning_test_results
    )
      and audit_event.action = 'owner_activation.completed'
      and audit_event.actor_id = (reset_result->>'activationAuthUserId')::uuid
      and audit_event.after_data->>'activationRequestId' = activation_request_id::text
      and audit_event.after_data->>'membershipState' = 'active'
      and audit_event.after_data->>'ownerAccountStep' = 'passed'
      and not audit_event.after_data ? 'temporaryPasswordHash'
      and not audit_event.after_data ? 'temporary_password_hash'
      and pg_catalog.strpos(audit_event.after_data::text, issued_hash) = 0
      and pg_catalog.strpos(audit_event.after_data::text, reset_hash) = 0
  ),
  'confirmation update atomically binds the stable Auth ID and exact request to one active owner'
)
from manual_owner_activation_results;

select throws_ok(
  $competing_manual_owner_request$
    update auth.users as auth_user
    set raw_app_meta_data = auth_user.raw_app_meta_data
      || pg_catalog.jsonb_build_object(
        'pgflow_activation_request_id', 'f0000000-0000-4000-8000-000000000002'
      )
    from manual_owner_activation_results as activation_result
    where auth_user.id = (activation_result.reset_result->>'activationAuthUserId')::uuid
  $competing_manual_owner_request$,
  'P0001',
  'The manual owner activation attempt is no longer current.',
  'the guarded Auth trigger rejects a competing request ID after one exact request commits'
);

create temporary table owner_recovery_test_results as
select
  public.issue_owner_password_recovery(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    (select (first_result->>'organizationId')::uuid from provisioning_test_results),
    pg_catalog.repeat('c', 64),
    pg_catalog.clock_timestamp() + interval '30 minutes'
  ) as issue_result,
  'f1000000-0000-4000-8000-000000000001'::uuid as recovery_request_id,
  pg_catalog.repeat('d', 64) as password_intent_hash;

select ok(
  (select issue_result->>'state' = 'issued' from owner_recovery_test_results)
  and (
    select count(*) = 1
    from public.owner_password_recoveries as recovery
    where recovery.id = (select (issue_result->>'recoveryId')::uuid from owner_recovery_test_results)
      and recovery.state = 'issued'
      and recovery.credential_hash = pg_catalog.repeat('c', 64)
      and recovery.recovery_request_id is null
  )
  and (
    select count(*) = 1
    from public.audit_events as audit_event
    where audit_event.entity_id = (select issue_result->>'recoveryId' from owner_recovery_test_results)
      and audit_event.action = 'owner_password_recovery.issued'
      and pg_catalog.strpos(audit_event.after_data::text, pg_catalog.repeat('c', 64)) = 0
  ),
  'operator recovery issue stores only a short-lived hash and safe audit metadata'
);

alter table owner_recovery_test_results add column claim_result jsonb;
update owner_recovery_test_results
set claim_result = public.claim_owner_password_recovery(
  (select (first_result->>'organizationId')::uuid from provisioning_test_results),
  issue_result->>'phone',
  pg_catalog.repeat('c', 64),
  recovery_request_id,
  password_intent_hash
);

select ok(
  (select claim_result->>'state' = 'processing' from owner_recovery_test_results)
  and (
    select count(*) = 1
    from public.owner_password_recoveries as recovery
    where recovery.id = (select (issue_result->>'recoveryId')::uuid from owner_recovery_test_results)
      and recovery.state = 'processing'
      and recovery.recovery_request_id = (select recovery_request_id from owner_recovery_test_results)
      and recovery.password_intent_hash = (select password_intent_hash from owner_recovery_test_results)
  ),
  'exact recovery claim binds one request ID and password intent'
);

select throws_ok(
  format(
    'select public.claim_owner_password_recovery(%L::uuid, %L, %L, %L::uuid, %L)',
    (select first_result->>'organizationId' from provisioning_test_results),
    (select issue_result->>'phone' from owner_recovery_test_results),
    pg_catalog.repeat('c', 64),
    'f1000000-0000-4000-8000-000000000002',
    pg_catalog.repeat('e', 64)
  ),
  'P0001',
  'Owner recovery is already processing another request.',
  'a competing recovery request cannot replace the claimed password intent'
);

alter table owner_recovery_test_results add column completion_result jsonb;
update owner_recovery_test_results
set completion_result = public.complete_owner_password_recovery(
  (issue_result->>'recoveryId')::uuid,
  (issue_result->>'authUserId')::uuid,
  recovery_request_id,
  password_intent_hash
);

select ok(
  (select completion_result->>'state' = 'completed' from owner_recovery_test_results)
  and (
    select count(*) = 1
    from public.owner_password_recoveries as recovery
    where recovery.id = (select (issue_result->>'recoveryId')::uuid from owner_recovery_test_results)
      and recovery.state = 'completed'
      and recovery.credential_hash is null
      and recovery.completed_at is not null
  )
  and (
    select count(*) = 1
    from public.audit_events as audit_event
    where audit_event.entity_id = (select issue_result->>'recoveryId' from owner_recovery_test_results)
      and audit_event.action = 'owner_password_recovery.completed'
      and audit_event.after_data->>'sessionsRevokedByApplication' = 'true'
      and pg_catalog.strpos(audit_event.after_data::text, pg_catalog.repeat('c', 64)) = 0
  ),
  'recovery completion erases the credential hash and writes safe audit metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.organizations), 1::bigint, 'owner sees only their organization');
select is((select count(*) from public.tenant_profiles), 4::bigint, 'owner sees tenants only inside their organization');

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.tenant_profiles), 1::bigint, 'tenant sees only their profile');
select is((select count(*) from public.invoices), 1::bigint, 'tenant sees only their invoice');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.organizations), 0::bigint, 'disabled membership has no organization access');
select is((select count(*) from public.tenant_profiles), 0::bigint, 'disabled tenant cannot read a linked tenant profile');

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.tenant_profiles), 0::bigint, 'invited tenant cannot read a linked tenant profile');

reset role;
select * from finish();
rollback;

-- Minimal persistent provisioning control plane.
-- The RPC creates only an empty organization core. Auth users, memberships,
-- rooms, tenants, invoices, and payments remain separate explicit workflows.

alter table public.organizations
  add constraint organizations_name_format_check
  check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
    and name !~ '[[:cntrl:]]'
  );

alter table public.properties
  add constraint properties_name_format_check
  check (
    name = pg_catalog.btrim(name)
    and pg_catalog.char_length(name) between 2 and 120
    and name !~ '[[:cntrl:]]'
  );

alter table public.brand_themes
  add constraint brand_themes_org_id_uq
  unique (organization_id, id);

alter table public.domain_mappings
  add constraint domain_mappings_org_id_uq
  unique (organization_id, id);

create unique index domain_mappings_one_platform_subdomain_uq
  on public.domain_mappings (organization_id)
  where kind = 'platform_subdomain';

create table public.provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  brand_theme_id uuid not null,
  domain_mapping_id uuid not null,
  template_version_id uuid not null references public.template_versions(id) on delete restrict,
  requested_by uuid not null references public.platform_operators(auth_user_id) on delete restrict,
  idempotency_key_hash text not null unique
    check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  request_fingerprint jsonb not null
    check (pg_catalog.jsonb_typeof(request_fingerprint) = 'object'),
  state text not null default 'awaiting_data'
    check (state in (
      'draft',
      'awaiting_data',
      'validating',
      'ready_to_provision',
      'provisioning',
      'core_ready',
      'integrations_pending',
      'live',
      'failed'
    )),
  safe_error_code text
    check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_]{1,64}$'),
  safe_error_message text
    check (safe_error_message is null or char_length(safe_error_message) between 1 and 240),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete restrict,
  foreign key (organization_id, brand_theme_id)
    references public.brand_themes (organization_id, id)
    on delete restrict,
  foreign key (organization_id, domain_mapping_id)
    references public.domain_mappings (organization_id, id)
    on delete restrict,
  check (finished_at is null or (started_at is not null and finished_at >= started_at)),
  check (
    (state = 'failed' and safe_error_code is not null)
    or (state <> 'failed' and safe_error_code is null and safe_error_message is null)
  )
);

create index provisioning_jobs_org_created_idx
  on public.provisioning_jobs (organization_id, created_at desc);
create index provisioning_jobs_state_created_idx
  on public.provisioning_jobs (state, created_at);

create table public.provisioning_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  job_id uuid not null,
  key text not null,
  sort_order smallint not null check (sort_order between 0 and 8),
  state text not null default 'pending'
    check (state in ('pending', 'running', 'passed', 'failed', 'skipped')),
  retry_count integer not null default 0 check (retry_count >= 0),
  safe_error_code text
    check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_]{1,64}$'),
  safe_error_message text
    check (safe_error_message is null or char_length(safe_error_message) between 1 and 240),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, job_id)
    references public.provisioning_jobs (organization_id, id)
    on delete cascade,
  unique (job_id, key),
  unique (job_id, sort_order),
  check (
    (key = 'organization' and sort_order = 0)
    or (key = 'branding' and sort_order = 1)
    or (key = 'property_data' and sort_order = 2)
    or (key = 'owner_account' and sort_order = 3)
    or (key = 'upi_and_rules' and sort_order = 4)
    or (key = 'storage_namespace' and sort_order = 5)
    or (key = 'authorization_smoke_test' and sort_order = 6)
    or (key = 'billing_preview' and sort_order = 7)
    or (key = 'pwa_manifest' and sort_order = 8)
  ),
  check (
    (state = 'pending' and started_at is null and finished_at is null)
    or (state = 'running' and started_at is not null and finished_at is null)
    or (state in ('passed', 'failed') and started_at is not null and finished_at is not null)
    or (state = 'skipped' and finished_at is not null)
  ),
  check (finished_at is null or (started_at is null or finished_at >= started_at)),
  check (
    (state = 'failed' and safe_error_code is not null)
    or (state <> 'failed' and safe_error_code is null and safe_error_message is null)
  )
);

alter table public.provisioning_jobs enable row level security;
alter table public.provisioning_steps enable row level security;

-- No anon/authenticated policy is created. Only the server role can inspect or
-- advance jobs, and only the RPC below can create an organization core.
revoke all on public.provisioning_jobs from public, anon, authenticated, service_role;
revoke all on public.provisioning_steps from public, anon, authenticated, service_role;
grant select on public.provisioning_jobs to service_role;
grant update (
  state,
  safe_error_code,
  safe_error_message,
  started_at,
  finished_at
) on public.provisioning_jobs to service_role;
grant select on public.provisioning_steps to service_role;
grant update (
  state,
  retry_count,
  safe_error_code,
  safe_error_message,
  started_at,
  finished_at
) on public.provisioning_steps to service_role;

create trigger provisioning_jobs_set_updated_at
before update on public.provisioning_jobs
for each row execute function public.set_updated_at();

create trigger provisioning_steps_set_updated_at
before update on public.provisioning_steps
for each row execute function public.set_updated_at();

create or replace function public.provision_organization_core(
  p_operator_user_id uuid,
  p_template_version text,
  p_name text,
  p_slug text,
  p_hostname text,
  p_property_name text,
  p_primary_color text,
  p_accent_color text,
  p_idempotency_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template_version text := pg_catalog.btrim(p_template_version);
  v_name text := pg_catalog.btrim(p_name);
  v_slug text := pg_catalog.lower(pg_catalog.btrim(p_slug));
  v_hostname text := pg_catalog.lower(pg_catalog.btrim(p_hostname));
  v_property_name text := pg_catalog.btrim(p_property_name);
  v_primary_color text := pg_catalog.lower(pg_catalog.btrim(p_primary_color));
  v_accent_color text := pg_catalog.lower(pg_catalog.btrim(p_accent_color));
  v_idempotency_key_hash text := pg_catalog.btrim(p_idempotency_key_hash);
  v_request_fingerprint jsonb;
  v_template_version_id uuid;
  v_organization_id uuid;
  v_property_id uuid;
  v_brand_theme_id uuid;
  v_domain_mapping_id uuid;
  v_job_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing record;
begin
  if p_operator_user_id is null then
    raise exception using errcode = '22023', message = 'An operator user ID is required.';
  end if;

  if v_template_version is null
    or pg_catalog.char_length(v_template_version) not between 1 and 64
    or v_template_version !~ '^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$'
  then
    raise exception using errcode = '22023', message = 'A valid template version is required.';
  end if;

  if v_name is null
    or pg_catalog.char_length(v_name) not between 2 and 120
    or v_name ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'A valid organization name is required.';
  end if;

  if v_slug is null
    or v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$'
  then
    raise exception using errcode = '22023', message = 'A valid organization slug is required.';
  end if;

  if v_hostname is null
    or pg_catalog.char_length(v_hostname) not between 1 and 253
    or exists (
      select 1
      from pg_catalog.unnest(pg_catalog.string_to_array(v_hostname, '.'))
        as hostname_label(label)
      where pg_catalog.char_length(hostname_label.label) not between 1 and 63
        or hostname_label.label !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    )
  then
    raise exception using errcode = '22023', message = 'A valid normalized hostname is required.';
  end if;

  if v_property_name is null
    or pg_catalog.char_length(v_property_name) not between 2 and 120
    or v_property_name ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'A valid property name is required.';
  end if;

  if v_primary_color is null or v_primary_color !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023', message = 'A valid primary color is required.';
  end if;

  if v_accent_color is null or v_accent_color !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023', message = 'A valid accent color is required.';
  end if;

  if v_idempotency_key_hash is null
    or v_idempotency_key_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'A lowercase SHA-256 idempotency hash is required.';
  end if;

  v_request_fingerprint := pg_catalog.jsonb_build_object(
    'templateVersion', v_template_version,
    'organizationName', v_name,
    'organizationSlug', v_slug,
    'hostname', v_hostname,
    'propertyName', v_property_name,
    'primaryColor', v_primary_color,
    'accentColor', v_accent_color
  );

  if not exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_operator_user_id
      and platform_operator.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active platform operator is required.';
  end if;

  -- A transaction-scoped lock makes check-then-create deterministic. The table
  -- uniqueness constraint remains the final protection against duplicate jobs.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_idempotency_key_hash, 0)
  );

  select
    provisioning_job.id as job_id,
    provisioning_job.organization_id,
    provisioning_job.property_id,
    provisioning_job.brand_theme_id,
    provisioning_job.domain_mapping_id,
    provisioning_job.template_version_id,
    provisioning_job.state,
    provisioning_job.request_fingerprint,
    organization.name as organization_name,
    organization.slug as organization_slug,
    property.name as property_name,
    domain_mapping.hostname,
    template_version.version as template_version
  into v_existing
  from public.provisioning_jobs as provisioning_job
  join public.organizations as organization
    on organization.id = provisioning_job.organization_id
  join public.properties as property
    on property.id = provisioning_job.property_id
    and property.organization_id = provisioning_job.organization_id
  join public.domain_mappings as domain_mapping
    on domain_mapping.id = provisioning_job.domain_mapping_id
    and domain_mapping.organization_id = provisioning_job.organization_id
  join public.template_versions as template_version
    on template_version.id = provisioning_job.template_version_id
  where provisioning_job.idempotency_key_hash = v_idempotency_key_hash;

  if found then
    if v_existing.request_fingerprint is distinct from v_request_fingerprint then
      raise exception using
        errcode = 'P0001',
        message = 'The idempotency hash conflicts with an existing provisioning request.';
    end if;

    return pg_catalog.jsonb_build_object(
      'jobId', v_existing.job_id,
      'organizationId', v_existing.organization_id,
      'propertyId', v_existing.property_id,
      'brandThemeId', v_existing.brand_theme_id,
      'domainMappingId', v_existing.domain_mapping_id,
      'templateVersionId', v_existing.template_version_id,
      'organizationName', v_existing.organization_name,
      'organizationSlug', v_existing.organization_slug,
      'propertyName', v_existing.property_name,
      'hostname', v_existing.hostname,
      'templateVersion', v_existing.template_version,
      'state', v_existing.state,
      'idempotentReplay', true
    );
  end if;

  select template_version.id
  into v_template_version_id
  from public.template_versions as template_version
  where template_version.version = v_template_version
    and template_version.status = 'current';

  if not found then
    raise exception using errcode = '22023', message = 'The requested template is not current.';
  end if;

  if exists (
    select 1
    from public.organizations as organization
    where organization.slug = v_slug
  ) then
    raise exception using errcode = '23505', message = 'The organization slug is unavailable.';
  end if;

  if exists (
    select 1
    from public.domain_mappings as domain_mapping
    where domain_mapping.hostname = v_hostname
  ) then
    raise exception using errcode = '23505', message = 'The hostname is unavailable.';
  end if;

  insert into public.organizations (
    name,
    slug,
    template_version_id,
    state,
    demo_mode
  )
  values (
    v_name,
    v_slug,
    v_template_version_id,
    'draft',
    false
  )
  returning id into v_organization_id;

  insert into public.properties (organization_id, name)
  values (v_organization_id, v_property_name)
  returning id into v_property_id;

  insert into public.brand_themes (
    organization_id,
    primary_color,
    accent_color,
    app_name,
    short_name
  )
  values (
    v_organization_id,
    v_primary_color,
    v_accent_color,
    v_name,
    pg_catalog.left(v_name, 24)
  )
  returning id into v_brand_theme_id;

  insert into public.domain_mappings (
    organization_id,
    hostname,
    kind,
    state,
    verification
  )
  values (
    v_organization_id,
    v_hostname,
    'platform_subdomain',
    'verified',
    pg_catalog.jsonb_build_object(
      'method', 'platform_control_plane',
      'verifiedAt', v_now
    )
  )
  returning id into v_domain_mapping_id;

  insert into public.provisioning_jobs (
    organization_id,
    property_id,
    brand_theme_id,
    domain_mapping_id,
    template_version_id,
    requested_by,
    idempotency_key_hash,
    request_fingerprint,
    state,
    started_at
  )
  values (
    v_organization_id,
    v_property_id,
    v_brand_theme_id,
    v_domain_mapping_id,
    v_template_version_id,
    p_operator_user_id,
    v_idempotency_key_hash,
    v_request_fingerprint,
    'awaiting_data',
    v_now
  )
  returning id into v_job_id;

  insert into public.provisioning_steps (
    organization_id,
    job_id,
    key,
    sort_order,
    state,
    started_at,
    finished_at
  )
  values
    (v_organization_id, v_job_id, 'organization', 0, 'passed', v_now, v_now),
    (v_organization_id, v_job_id, 'branding', 1, 'passed', v_now, v_now),
    (v_organization_id, v_job_id, 'property_data', 2, 'passed', v_now, v_now),
    (v_organization_id, v_job_id, 'owner_account', 3, 'pending', null, null),
    (v_organization_id, v_job_id, 'upi_and_rules', 4, 'pending', null, null),
    (v_organization_id, v_job_id, 'storage_namespace', 5, 'pending', null, null),
    (v_organization_id, v_job_id, 'authorization_smoke_test', 6, 'pending', null, null),
    (v_organization_id, v_job_id, 'billing_preview', 7, 'pending', null, null),
    (v_organization_id, v_job_id, 'pwa_manifest', 8, 'pending', null, null);

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  values (
    v_organization_id,
    p_operator_user_id,
    'provisioning.core_created',
    'provisioning_job',
    v_job_id::text,
    pg_catalog.jsonb_build_object(
      'jobId', v_job_id,
      'templateVersionId', v_template_version_id,
      'state', 'awaiting_data'
    )
  );

  select
    provisioning_job.id as job_id,
    provisioning_job.organization_id,
    provisioning_job.property_id,
    provisioning_job.brand_theme_id,
    provisioning_job.domain_mapping_id,
    provisioning_job.template_version_id,
    provisioning_job.state,
    provisioning_job.request_fingerprint,
    organization.name as organization_name,
    organization.slug as organization_slug,
    property.name as property_name,
    domain_mapping.hostname,
    template_version.version as template_version
  into strict v_existing
  from public.provisioning_jobs as provisioning_job
  join public.organizations as organization
    on organization.id = provisioning_job.organization_id
  join public.properties as property
    on property.id = provisioning_job.property_id
    and property.organization_id = provisioning_job.organization_id
  join public.domain_mappings as domain_mapping
    on domain_mapping.id = provisioning_job.domain_mapping_id
    and domain_mapping.organization_id = provisioning_job.organization_id
  join public.template_versions as template_version
    on template_version.id = provisioning_job.template_version_id
  where provisioning_job.id = v_job_id;

  return pg_catalog.jsonb_build_object(
    'jobId', v_existing.job_id,
    'organizationId', v_existing.organization_id,
    'propertyId', v_existing.property_id,
    'brandThemeId', v_existing.brand_theme_id,
    'domainMappingId', v_existing.domain_mapping_id,
    'templateVersionId', v_existing.template_version_id,
    'organizationName', v_existing.organization_name,
    'organizationSlug', v_existing.organization_slug,
    'propertyName', v_existing.property_name,
    'hostname', v_existing.hostname,
    'templateVersion', v_existing.template_version,
    'state', v_existing.state,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.provision_organization_core(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.provision_organization_core(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to service_role;

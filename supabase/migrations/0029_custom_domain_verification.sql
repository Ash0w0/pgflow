-- Custom domain verification infrastructure.
-- Adds DNS TXT challenge tokens and verification timestamps
-- to support PG owners bringing their own domains (e.g., yourpghostel.com).

-- Add verification columns to domain_mappings
alter table public.domain_mappings
  add column if not exists dns_txt_challenge text
    check (dns_txt_challenge is null or (
      dns_txt_challenge = btrim(dns_txt_challenge)
      and char_length(dns_txt_challenge) between 32 and 128
      and dns_txt_challenge ~ '^[a-zA-Z0-9_-]+$'
    ));

alter table public.domain_mappings
  add column if not exists verified_at timestamptz;

alter table public.domain_mappings
  add column if not exists last_checked_at timestamptz;

-- Expand the state machine to include dns_checking
alter table public.domain_mappings
  drop constraint if exists domain_mappings_state_check;

alter table public.domain_mappings
  add constraint domain_mappings_state_check
  check (state in ('pending', 'dns_checking', 'verified', 'failed'));

-- Verified custom domains must have a DNS challenge token
alter table public.domain_mappings
  add constraint domain_mappings_custom_requires_challenge
  check (
    kind = 'platform_subdomain'
    or state != 'verified'
    or (kind = 'custom' and dns_txt_challenge is not null)
  );

-- Verified custom domains must have a verified_at timestamp
alter table public.domain_mappings
  add constraint domain_mappings_verified_timestamp
  check (
    state != 'verified'
    or verified_at is not null
  );

-- Auto-verify existing platform subdomains and backfill verified_at timestamp
update public.domain_mappings
  set state = 'verified', verified_at = now()
  where kind = 'platform_subdomain' and state = 'pending';

update public.domain_mappings
  set verified_at = now()
  where state = 'verified' and verified_at is null;

-- Update provision_organization_core to include verified_at when inserting verified domain_mappings
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
    verified_at,
    verification
  )
  values (
    v_organization_id,
    v_hostname,
    'platform_subdomain',
    'verified',
    v_now,
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

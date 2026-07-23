-- Cut the bootstrap production tenant over from Vercel's project hostname to
-- the owned wildcard platform domain. Future organizations are already
-- provisioned as <slug>.<NEXT_PUBLIC_PLATFORM_DOMAIN>.

do $$
declare
  v_mapping record;
  v_target_hostname text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select
    domain_mapping.id,
    domain_mapping.organization_id,
    organization.slug
  into v_mapping
  from public.domain_mappings as domain_mapping
  join public.organizations as organization
    on organization.id = domain_mapping.organization_id
  where domain_mapping.hostname = 'pgflow-ruby.vercel.app'
  order by domain_mapping.created_at asc
  limit 1
  for update of domain_mapping;

  -- Environments that never used the temporary Vercel hostname need no cutover.
  if not found then
    return;
  end if;

  v_target_hostname := v_mapping.slug || '.pgflow.co';

  if exists (
    select 1
    from public.domain_mappings as conflicting_mapping
    where conflicting_mapping.id != v_mapping.id
      and (
        conflicting_mapping.hostname = v_target_hostname
        or (
          conflicting_mapping.organization_id = v_mapping.organization_id
          and conflicting_mapping.kind = 'platform_subdomain'
        )
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'The pgflow.co platform hostname conflicts with an existing domain mapping.';
  end if;

  update public.domain_mappings as domain_mapping
  set
    hostname = v_target_hostname,
    kind = 'platform_subdomain',
    state = 'verified',
    verified_at = coalesce(domain_mapping.verified_at, v_now),
    verification = domain_mapping.verification || pg_catalog.jsonb_build_object(
      'method', 'platform_wildcard',
      'baseDomain', 'pgflow.co',
      'migratedFrom', 'pgflow-ruby.vercel.app',
      'verifiedAt', v_now
    )
  where domain_mapping.id = v_mapping.id;
end;
$$;

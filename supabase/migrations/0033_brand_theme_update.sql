-- Audited owner-driven brand theme updates.
--
-- Branding is organization-scoped (brand_themes.organization_id is unique), so authority is
-- checked against an active owner membership on the organization rather than a property.
-- app_name/short_name are `not null` with no default, so the first write for an organization
-- seeds them from organizations.name instead of failing the insert.

create or replace function public.update_brand_theme(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_primary_color text,
  p_accent_color text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary text := pg_catalog.lower(pg_catalog.btrim(p_primary_color));
  v_accent text := pg_catalog.lower(pg_catalog.btrim(p_accent_color));
  v_org_name text;
  v_before jsonb;
  v_theme public.brand_themes;
begin
  if not exists (
    select 1
    from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active organization-owner access is required.';
  end if;

  -- Re-validate server-side: these values are interpolated into CSS custom properties.
  if v_primary !~ '^#[0-9a-f]{6}$' or v_accent !~ '^#[0-9a-f]{6}$' then
    raise exception using errcode = '22023', message = 'Enter both colors as six-digit hex values.';
  end if;

  select name into v_org_name
  from public.organizations
  where id = p_organization_id
    and state not in ('archived', 'suspended');

  if v_org_name is null then
    raise exception using errcode = 'P0001', message = 'Organization not found.';
  end if;

  select pg_catalog.jsonb_build_object('primaryColor', primary_color, 'accentColor', accent_color)
    into v_before
  from public.brand_themes
  where organization_id = p_organization_id;

  insert into public.brand_themes as bt (
    organization_id, primary_color, accent_color, app_name, short_name, updated_at
  )
  values (
    p_organization_id,
    v_primary,
    v_accent,
    v_org_name,
    pg_catalog.substr(v_org_name, 1, 24),
    pg_catalog.now()
  )
  on conflict (organization_id) do update
    set primary_color = excluded.primary_color,
        accent_color = excluded.accent_color,
        updated_at = pg_catalog.now()
  returning bt.* into v_theme;

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_organization_id,
    p_actor_user_id,
    'organization.brand_theme_updated',
    'brand_theme',
    v_theme.id::text,
    v_before,
    pg_catalog.jsonb_build_object('primaryColor', v_theme.primary_color, 'accentColor', v_theme.accent_color)
  );

  return pg_catalog.jsonb_build_object(
    'primaryColor', v_theme.primary_color,
    'accentColor', v_theme.accent_color,
    'appName', v_theme.app_name,
    'shortName', v_theme.short_name
  );
end $$;

revoke all on function public.update_brand_theme(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_brand_theme(uuid, uuid, text, text) to service_role;

comment on function public.update_brand_theme(uuid, uuid, text, text) is
  'Owner-authorized, audited brand color update. Colors are re-validated as six-digit hex server-side.';

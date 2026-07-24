-- Enforce the starter resident entitlement at the database boundary.
-- Existing organizations are grandfathered at their current active resident
-- count, while newly provisioned organizations begin with two resident slots.

alter table public.organizations
  add column if not exists resident_limit integer not null default 2
  check (resident_limit between 2 and 100000);

update public.organizations as organization
set resident_limit = greatest(
  organization.resident_limit,
  2,
  (
    select pg_catalog.count(*)::integer
    from public.tenant_profiles as resident
    where resident.organization_id = organization.id
      and resident.state in ('active', 'notice')
  )
);

create or replace function public.enforce_organization_resident_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_active_count integer;
begin
  if new.state not in ('active', 'notice') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.organization_id = new.organization_id
      and old.state in ('active', 'notice')
    then
      return new;
    end if;
  end if;

  select organization.resident_limit
  into v_limit
  from public.organizations as organization
  where organization.id = new.organization_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The resident organization does not exist.';
  end if;

  select pg_catalog.count(*)::integer
  into v_active_count
  from public.tenant_profiles as resident
  where resident.organization_id = new.organization_id
    and resident.state in ('active', 'notice')
    and resident.id <> new.id;

  if v_active_count >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'Your PGFlow resident limit has been reached. Contact PGFlow on WhatsApp to upgrade.';
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_profiles_enforce_resident_limit on public.tenant_profiles;
create trigger tenant_profiles_enforce_resident_limit
before insert or update of organization_id, state on public.tenant_profiles
for each row execute function public.enforce_organization_resident_limit();

revoke all on function public.enforce_organization_resident_limit()
from public, anon, authenticated;

comment on column public.organizations.resident_limit is
  'Maximum active or notice-period residents allowed for the organization. New organizations default to two; PGFlow support may raise this after an upgrade.';

comment on function public.enforce_organization_resident_limit() is
  'Serializes resident creation per organization and blocks active residents beyond its configured entitlement.';

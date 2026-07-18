-- Owner-only resident corrections and a tightly guarded undo for empty,
-- recent onboarding mistakes. Real residents with activity require move-out.

create or replace function public.update_active_resident_details(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_full_name text,
  p_phone text,
  p_alternate_phone text,
  p_emergency_name text,
  p_emergency_phone text,
  p_address text,
  p_move_in_date date,
  p_monthly_rent bigint,
  p_deposit_promised bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := pg_catalog.btrim(p_full_name);
  v_emergency_name text := pg_catalog.btrim(p_emergency_name);
  v_address text := pg_catalog.btrim(p_address);
  v_alternate_phone text := nullif(pg_catalog.btrim(p_alternate_phone), '');
  v_tenant public.tenant_profiles;
  v_occupancy public.occupancies;
  v_changed_fields jsonb;
begin
  if not exists (
    select 1 from public.memberships as membership
    where membership.auth_user_id = p_actor_user_id
      and membership.organization_id = p_organization_id
      and membership.property_id = p_property_id
      and membership.role = 'owner'
      and membership.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active property owner is required.';
  end if;

  if v_full_name is null or pg_catalog.length(v_full_name) not between 2 and 120
    or p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$'
    or (v_alternate_phone is not null and v_alternate_phone !~ '^\+91[6-9][0-9]{9}$')
    or v_alternate_phone = p_phone
    or v_emergency_name is null or pg_catalog.length(v_emergency_name) not between 2 and 120
    or p_emergency_phone is null or p_emergency_phone !~ '^\+91[6-9][0-9]{9}$'
    or v_address is null or pg_catalog.length(v_address) > 500
    or p_move_in_date is null or p_move_in_date < date '2000-01-01' or p_move_in_date > current_date + 365
    or p_monthly_rent is null or p_monthly_rent not between 0 and 10000000
    or p_deposit_promised is null or p_deposit_promised not between 0 and 10000000
  then
    raise exception using errcode = '22023', message = 'One or more resident details are invalid.';
  end if;

  select tenant.* into v_tenant
  from public.tenant_profiles as tenant
  where tenant.id = p_tenant_id
    and tenant.organization_id = p_organization_id
    and tenant.property_id = p_property_id
    and tenant.state = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The active resident could not be found.';
  end if;

  select occupancy.* into v_occupancy
  from public.occupancies as occupancy
  where occupancy.organization_id = p_organization_id
    and occupancy.property_id = p_property_id
    and occupancy.tenant_id = p_tenant_id
    and occupancy.state = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The resident has no editable active occupancy.';
  end if;

  select pg_catalog.coalesce(pg_catalog.jsonb_agg(change.field_name), '[]'::jsonb)
  into v_changed_fields
  from (values
    (case when v_tenant.full_name is distinct from v_full_name then 'fullName' end),
    (case when v_tenant.phone is distinct from p_phone then 'phone' end),
    (case when v_tenant.alternate_phone is distinct from v_alternate_phone then 'alternatePhone' end),
    (case when v_tenant.emergency_name is distinct from v_emergency_name then 'emergencyName' end),
    (case when v_tenant.emergency_phone is distinct from p_emergency_phone then 'emergencyPhone' end),
    (case when v_tenant.address is distinct from v_address then 'address' end),
    (case when v_occupancy.move_in_date is distinct from p_move_in_date then 'moveInDate' end),
    (case when v_occupancy.monthly_rent is distinct from p_monthly_rent then 'monthlyRent' end),
    (case when v_occupancy.deposit_promised is distinct from p_deposit_promised then 'depositPromised' end)
  ) as change(field_name)
  where change.field_name is not null;

  if pg_catalog.jsonb_array_length(v_changed_fields) = 0 then
    return pg_catalog.jsonb_build_object('residentId', p_tenant_id, 'changedFields', v_changed_fields);
  end if;

  update public.tenant_profiles
  set full_name = v_full_name,
      phone = p_phone,
      alternate_phone = v_alternate_phone,
      emergency_name = v_emergency_name,
      emergency_phone = p_emergency_phone,
      address = v_address,
      updated_at = pg_catalog.now()
  where id = p_tenant_id and organization_id = p_organization_id and property_id = p_property_id;

  update public.occupancies
  set move_in_date = p_move_in_date,
      monthly_rent = p_monthly_rent,
      deposit_promised = p_deposit_promised,
      updated_at = pg_catalog.now()
  where id = v_occupancy.id and organization_id = p_organization_id and property_id = p_property_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_organization_id,
    p_actor_user_id,
    'resident.details_updated',
    'tenant_profile',
    p_tenant_id::text,
    pg_catalog.jsonb_build_object(
      'changedFields', v_changed_fields,
      'moveInDate', v_occupancy.move_in_date,
      'monthlyRent', v_occupancy.monthly_rent,
      'depositPromised', v_occupancy.deposit_promised
    ),
    pg_catalog.jsonb_build_object(
      'changedFields', v_changed_fields,
      'moveInDate', p_move_in_date,
      'monthlyRent', p_monthly_rent,
      'depositPromised', p_deposit_promised
    )
  );

  return pg_catalog.jsonb_build_object('residentId', p_tenant_id, 'changedFields', v_changed_fields);
end;
$$;

create or replace function public.undo_empty_resident_onboarding(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenant_profiles;
  v_occupancy public.occupancies;
  v_bed public.beds;
begin
  if not exists (
    select 1 from public.memberships as membership
    where membership.auth_user_id = p_actor_user_id
      and membership.organization_id = p_organization_id
      and membership.property_id = p_property_id
      and membership.role = 'owner'
      and membership.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active property owner is required.';
  end if;

  select tenant.* into v_tenant
  from public.tenant_profiles as tenant
  where tenant.id = p_tenant_id
    and tenant.organization_id = p_organization_id
    and tenant.property_id = p_property_id
    and tenant.state = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The active resident could not be found.';
  end if;

  if pg_catalog.btrim(p_confirmation_name) <> v_tenant.full_name then
    raise exception using errcode = '22023', message = 'The resident name confirmation does not match.';
  end if;
  if v_tenant.membership_id is not null then
    raise exception using errcode = 'P0001', message = 'This resident already has login access and cannot be undone.';
  end if;
  if v_tenant.created_at < pg_catalog.now() - interval '24 hours' then
    raise exception using errcode = 'P0001', message = 'The 24-hour onboarding undo window has expired.';
  end if;
  if exists (select 1 from public.invoices where organization_id = p_organization_id and tenant_id = p_tenant_id)
    or exists (select 1 from public.payments where organization_id = p_organization_id and tenant_id = p_tenant_id)
  then
    raise exception using errcode = 'P0001', message = 'Financial activity exists. Use the move-out workflow instead.';
  end if;

  select occupancy.* into v_occupancy
  from public.occupancies as occupancy
  where occupancy.organization_id = p_organization_id
    and occupancy.property_id = p_property_id
    and occupancy.tenant_id = p_tenant_id
    and occupancy.state = 'active'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The resident has no undoable active occupancy.';
  end if;

  select bed.* into v_bed
  from public.beds as bed
  where bed.id = v_occupancy.bed_id
    and bed.organization_id = p_organization_id
    and bed.property_id = p_property_id
    and bed.state = 'occupied'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The assigned bed is not in the expected occupied state.';
  end if;

  update public.beds
  set state = 'vacant', updated_at = pg_catalog.now()
  where id = v_bed.id and organization_id = p_organization_id and property_id = p_property_id;

  delete from public.occupancies
  where id = v_occupancy.id and organization_id = p_organization_id and property_id = p_property_id;

  delete from public.tenant_profiles
  where id = p_tenant_id and organization_id = p_organization_id and property_id = p_property_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id,
    p_actor_user_id,
    'resident.empty_onboarding_undone',
    'tenant_profile',
    p_tenant_id::text,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'occupancyId', v_occupancy.id,
      'bedId', v_bed.id,
      'bedRestoredTo', 'vacant',
      'reason', 'empty_onboarding_correction'
    )
  );

  return pg_catalog.jsonb_build_object('residentId', p_tenant_id, 'bedId', v_bed.id, 'bedState', 'vacant');
end;
$$;

revoke all on function public.update_active_resident_details(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, bigint, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.update_active_resident_details(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, bigint, bigint
) to service_role;

revoke all on function public.undo_empty_resident_onboarding(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.undo_empty_resident_onboarding(uuid, uuid, uuid, uuid, text)
to service_role;

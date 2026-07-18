-- Atomic resident onboarding: profile, occupancy, bed state, optional opening
-- invoice, and audit event either commit together or not at all.

create or replace function public.onboard_resident_to_bed(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_bed_id uuid,
  p_full_name text,
  p_phone text,
  p_alternate_phone text,
  p_emergency_name text,
  p_emergency_phone text,
  p_address text,
  p_move_in_date date,
  p_monthly_rent bigint,
  p_deposit_promised bigint,
  p_opening_due bigint
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
  v_bed record;
  v_tenant public.tenant_profiles;
  v_occupancy public.occupancies;
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if p_actor_user_id is null or p_organization_id is null or p_property_id is null or p_bed_id is null then
    raise exception using errcode = '22023', message = 'Actor, organization, property, and bed are required.';
  end if;
  if v_full_name is null or pg_catalog.length(v_full_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Resident name must contain 2 to 120 characters.';
  end if;
  if p_phone is null or p_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'A valid Indian resident phone number is required.';
  end if;
  if v_alternate_phone is not null and v_alternate_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'The alternate phone number is invalid.';
  end if;
  if v_alternate_phone = p_phone then
    raise exception using errcode = '22023', message = 'The alternate phone must differ from the resident phone.';
  end if;
  if v_emergency_name is null or pg_catalog.length(v_emergency_name) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'Emergency contact name must contain 2 to 120 characters.';
  end if;
  if p_emergency_phone is null or p_emergency_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'A valid Indian emergency phone number is required.';
  end if;
  if v_address is null or pg_catalog.length(v_address) > 500 then
    raise exception using errcode = '22023', message = 'Address must not exceed 500 characters.';
  end if;
  if p_move_in_date is null or p_move_in_date < date '2000-01-01' or p_move_in_date > pg_catalog.current_date + 365 then
    raise exception using errcode = '22023', message = 'Move-in date is outside the supported range.';
  end if;
  if p_monthly_rent is null or p_monthly_rent not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'Monthly rent must be between 0 and 1 crore rupees.';
  end if;
  if p_deposit_promised is null or p_deposit_promised not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'Deposit promised must be between 0 and 1 crore rupees.';
  end if;
  if p_opening_due is null or p_opening_due not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'Opening due must be between 0 and 1 crore rupees.';
  end if;
  if not exists (
    select 1
    from public.memberships as membership
    where membership.auth_user_id = p_actor_user_id
      and membership.organization_id = p_organization_id
      and membership.property_id = p_property_id
      and membership.role = 'owner'
      and membership.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active property owner is required.';
  end if;

  select
    bed.id,
    bed.state as bed_state,
    bed.label as bed_label,
    room.id as room_id,
    room.code as room_code,
    room.state as room_state,
    floor.id as floor_id,
    floor.name as floor_name,
    floor.state as floor_state
  into v_bed
  from public.beds as bed
  join public.rooms as room
    on room.id = bed.room_id
    and room.organization_id = bed.organization_id
    and room.property_id = bed.property_id
  join public.floors as floor
    on floor.id = room.floor_id
    and floor.organization_id = room.organization_id
    and floor.property_id = room.property_id
  where bed.id = p_bed_id
    and bed.organization_id = p_organization_id
    and bed.property_id = p_property_id
  for update of bed;

  if not found
    or v_bed.bed_state <> 'vacant'
    or v_bed.room_state <> 'active'
    or v_bed.floor_state <> 'active'
  then
    raise exception using errcode = 'P0001', message = 'The selected bed is no longer available.';
  end if;
  if exists (
    select 1 from public.occupancies as occupancy
    where occupancy.organization_id = p_organization_id
      and occupancy.bed_id = p_bed_id
      and occupancy.state in ('active', 'notice')
  ) then
    raise exception using errcode = 'P0001', message = 'The selected bed already has an active occupancy.';
  end if;

  insert into public.tenant_profiles (
    organization_id, property_id, full_name, phone, alternate_phone,
    emergency_name, emergency_phone, address, state
  ) values (
    p_organization_id, p_property_id, v_full_name, p_phone, v_alternate_phone,
    v_emergency_name, p_emergency_phone, v_address, 'active'
  )
  returning * into v_tenant;

  insert into public.occupancies (
    organization_id, property_id, tenant_id, bed_id, move_in_date,
    monthly_rent, deposit_promised, state
  ) values (
    p_organization_id, p_property_id, v_tenant.id, p_bed_id, p_move_in_date,
    p_monthly_rent, p_deposit_promised, 'active'
  )
  returning * into v_occupancy;

  update public.beds
  set state = 'occupied'
  where id = p_bed_id
    and organization_id = p_organization_id
    and property_id = p_property_id
    and state = 'vacant';

  if not found then
    raise exception using errcode = 'P0001', message = 'The selected bed changed before assignment completed.';
  end if;

  if p_opening_due > 0 then
    v_invoice_id := extensions.gen_random_uuid();
    v_invoice_number := 'OPEN-' || pg_catalog.upper(pg_catalog.replace(v_invoice_id::text, '-', ''));

    insert into public.invoices (
      id, organization_id, property_id, tenant_id, period, number,
      due_date, total_amount, paid_amount, state
    ) values (
      v_invoice_id, p_organization_id, p_property_id, v_tenant.id, 'opening', v_invoice_number,
      p_move_in_date, p_opening_due, 0, 'issued'
    );

    insert into public.invoice_line_items (
      organization_id, invoice_id, kind, description, amount, metadata
    ) values (
      p_organization_id,
      v_invoice_id,
      'adjustment',
      'Opening balance confirmed during onboarding',
      p_opening_due,
      pg_catalog.jsonb_build_object('source', 'resident_onboarding')
    );
  end if;

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    p_actor_user_id,
    'resident.onboarded',
    'tenant_profile',
    v_tenant.id::text,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'occupancyId', v_occupancy.id,
      'bedId', p_bed_id,
      'floorName', v_bed.floor_name,
      'roomCode', v_bed.room_code,
      'bedLabel', v_bed.bed_label,
      'moveInDate', p_move_in_date,
      'monthlyRent', p_monthly_rent,
      'depositPromised', p_deposit_promised,
      'openingDue', p_opening_due,
      'openingInvoiceId', v_invoice_id
    )
  );

  return pg_catalog.jsonb_build_object(
    'residentId', v_tenant.id,
    'occupancyId', v_occupancy.id,
    'bedId', p_bed_id,
    'roomCode', v_bed.room_code,
    'bedLabel', v_bed.bed_label,
    'openingInvoiceNumber', v_invoice_number
  );
end;
$$;

revoke all on function public.onboard_resident_to_bed(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, bigint, bigint, bigint
) from public, anon, authenticated, service_role;
grant execute on function public.onboard_resident_to_bed(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, bigint, bigint, bigint
) to service_role;

comment on function public.onboard_resident_to_bed(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text, date, bigint, bigint, bigint
) is 'Atomically onboards one resident into one verified vacant bed with an optional issued opening-balance invoice.';

-- Remove the redundant declaration of the integer FOR-loop variable reported
-- by plpgsql_check. Function behavior and authorization remain unchanged.

create or replace function public.create_room_with_beds(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_floor_id uuid,
  p_code text,
  p_room_type text,
  p_capacity integer,
  p_default_rent bigint,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(p_code));
  v_floor public.floors;
  v_room public.rooms;
  v_bed_state text;
begin
  if p_actor_user_id is null or p_organization_id is null or p_property_id is null or p_floor_id is null then
    raise exception using errcode = '22023', message = 'Actor, organization, property, and floor are required.';
  end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9._ -]{0,19}$' then
    raise exception using errcode = '22023', message = 'Room code must contain 1 to 20 letters, numbers, spaces, dots, dashes, or underscores.';
  end if;
  if p_room_type is null or p_room_type not in ('single', 'double', 'triple', 'shared') then
    raise exception using errcode = '22023', message = 'Room type is invalid.';
  end if;
  if p_capacity is null or p_capacity not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Bed capacity must be between 1 and 20.';
  end if;
  if p_default_rent is null or p_default_rent not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'Monthly rent must be between 0 and 1 crore rupees.';
  end if;
  if p_state is null or p_state not in ('active', 'maintenance') then
    raise exception using errcode = '22023', message = 'Room status is invalid.';
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

  select floor.*
  into v_floor
  from public.floors as floor
  where floor.id = p_floor_id
    and floor.organization_id = p_organization_id
    and floor.property_id = p_property_id
    and floor.state = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'The selected floor is unavailable.';
  end if;

  insert into public.rooms (
    organization_id, property_id, floor_id, floor_name, code,
    room_type, capacity, default_rent, state
  ) values (
    p_organization_id, p_property_id, v_floor.id, v_floor.name, v_code,
    p_room_type, p_capacity, p_default_rent, p_state
  )
  returning * into v_room;

  v_bed_state := case when p_state = 'maintenance' then 'maintenance' else 'vacant' end;
  for v_bed_number in 1..p_capacity loop
    insert into public.beds (
      organization_id, property_id, room_id, label, state
    ) values (
      p_organization_id, p_property_id, v_room.id, 'Bed ' || v_bed_number, v_bed_state
    );
  end loop;

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    p_actor_user_id,
    'room.created_with_beds',
    'room',
    v_room.id::text,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'floorId', v_floor.id,
      'floorName', v_floor.name,
      'code', v_room.code,
      'roomType', v_room.room_type,
      'capacity', v_room.capacity,
      'defaultRent', v_room.default_rent,
      'state', v_room.state,
      'bedState', v_bed_state
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_room.id,
    'floorId', v_floor.id,
    'code', v_room.code,
    'roomType', v_room.room_type,
    'capacity', v_room.capacity,
    'defaultRent', v_room.default_rent,
    'state', v_room.state,
    'bedState', v_bed_state
  );
end;
$$;

revoke all on function public.create_room_with_beds(uuid, uuid, uuid, uuid, text, text, integer, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_room_with_beds(uuid, uuid, uuid, uuid, text, text, integer, bigint, text)
  to service_role;

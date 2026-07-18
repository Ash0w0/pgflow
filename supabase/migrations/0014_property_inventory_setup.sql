-- Audited floor, room, and bed setup for an organization-scoped property.

create table public.floors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  name text not null check (name = btrim(name) and length(name) between 1 and 60),
  sort_order integer not null default 0 check (sort_order between 0 and 999),
  state text not null default 'active' check (state in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, property_id, id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id)
    on delete restrict
);

create unique index floors_org_property_name_uq
  on public.floors (organization_id, property_id, lower(name));
create index floors_org_property_sort_idx
  on public.floors (organization_id, property_id, sort_order, name);

alter table public.floors enable row level security;
create policy floors_member_select on public.floors
for select to authenticated
using (organization_id in (select public.current_organization_ids()));

revoke all on public.floors from public, anon, authenticated;
grant select on public.floors to authenticated;

create trigger floors_set_updated_at
before update on public.floors
for each row execute function public.set_updated_at();

alter table public.rooms
  add column floor_id uuid,
  add column room_type text not null default 'shared'
    check (room_type in ('single', 'double', 'triple', 'shared')),
  add constraint rooms_floor_property_fkey
    foreign key (organization_id, property_id, floor_id)
    references public.floors (organization_id, property_id, id)
    on delete restrict;

create index rooms_org_floor_idx
  on public.rooms (organization_id, property_id, floor_id, code);

create or replace function public.create_property_floor(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_name text,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(p_name);
  v_floor public.floors;
begin
  if p_actor_user_id is null or p_organization_id is null or p_property_id is null then
    raise exception using errcode = '22023', message = 'Actor, organization, and property are required.';
  end if;
  if v_name is null or pg_catalog.length(v_name) not between 1 and 60 then
    raise exception using errcode = '22023', message = 'Floor name must contain 1 to 60 characters.';
  end if;
  if p_sort_order is null or p_sort_order not between 0 and 999 then
    raise exception using errcode = '22023', message = 'Floor order must be between 0 and 999.';
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
  if not exists (
    select 1
    from public.properties as property
    join public.organizations as organization on organization.id = property.organization_id
    where property.id = p_property_id
      and property.organization_id = p_organization_id
      and organization.state in ('draft', 'core_ready', 'integrations_pending', 'live')
  ) then
    raise exception using errcode = 'P0001', message = 'The property is unavailable.';
  end if;

  insert into public.floors (organization_id, property_id, name, sort_order)
  values (p_organization_id, p_property_id, v_name, p_sort_order)
  returning * into v_floor;

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    p_actor_user_id,
    'floor.created',
    'floor',
    v_floor.id::text,
    pg_catalog.jsonb_build_object(
      'propertyId', p_property_id,
      'name', v_floor.name,
      'sortOrder', v_floor.sort_order,
      'state', v_floor.state
    )
  );

  return pg_catalog.jsonb_build_object(
    'id', v_floor.id,
    'name', v_floor.name,
    'sortOrder', v_floor.sort_order,
    'state', v_floor.state
  );
end;
$$;

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
  v_index integer;
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
  for v_index in 1..p_capacity loop
    insert into public.beds (
      organization_id, property_id, room_id, label, state
    ) values (
      p_organization_id, p_property_id, v_room.id, 'Bed ' || v_index, v_bed_state
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

revoke all on function public.create_property_floor(uuid, uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.create_property_floor(uuid, uuid, uuid, text, integer)
  to service_role;

revoke all on function public.create_room_with_beds(uuid, uuid, uuid, uuid, text, text, integer, bigint, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_room_with_beds(uuid, uuid, uuid, uuid, text, text, integer, bigint, text)
  to service_role;

comment on function public.create_property_floor(uuid, uuid, uuid, text, integer) is
  'Creates one audited property floor after verifying active owner authority.';
comment on function public.create_room_with_beds(uuid, uuid, uuid, uuid, text, text, integer, bigint, text) is
  'Atomically creates one audited room and its complete initial bed set after verifying active owner authority.';

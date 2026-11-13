-- All-or-nothing bulk import of rooms and residents.
--
-- Reuses create_property_floor, create_room_with_beds and
-- onboard_resident_to_bed, so every existing rule (owner authority, bed
-- vacancy, unique phones, opening dues, audit events, trial/read-only plan)
-- applies to imported rows exactly as it does to manual entry.
-- p_dry_run performs the full import inside a subtransaction and rolls it
-- back, so the owner sees every database-level problem before committing.

create or replace function public.bulk_import_property(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_rooms jsonb,
  p_residents jsonb,
  p_dry_run boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_floor_id uuid;
  v_bed_id uuid;
  v_sort integer;
  v_state text;
  v_message text;
  v_floors integer := 0;
  v_rooms integer := 0;
  v_rooms_existing integer := 0;
  v_beds integer := 0;
  v_residents integer := 0;
  v_opening_due bigint := 0;
begin
  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the active property owner can import rooms and residents.';
  end if;

  if pg_catalog.jsonb_typeof(coalesce(p_rooms, '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_typeof(coalesce(p_residents, '[]'::jsonb)) <> 'array'
    or pg_catalog.jsonb_array_length(coalesce(p_rooms, '[]'::jsonb)) > 300
    or pg_catalog.jsonb_array_length(coalesce(p_residents, '[]'::jsonb)) > 600
  then
    raise exception using errcode = '22023', message = 'Import at most 300 rooms and 600 residents at a time.';
  end if;

  begin
    for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) loop
      begin
        select floor.id into v_floor_id
        from public.floors as floor
        where floor.organization_id = p_organization_id
          and floor.property_id = p_property_id
          and pg_catalog.lower(floor.name) = pg_catalog.lower(pg_catalog.btrim(v_item ->> 'floor'));

        if v_floor_id is null then
          select coalesce(pg_catalog.max(sort_order), -1) + 1 into v_sort
          from public.floors where organization_id = p_organization_id and property_id = p_property_id;
          v_floor_id := (public.create_property_floor(
            p_actor_user_id, p_organization_id, p_property_id, pg_catalog.btrim(v_item ->> 'floor'), v_sort
          ) ->> 'id')::uuid;
          v_floors := v_floors + 1;
        end if;

        if exists (
          select 1 from public.rooms
          where organization_id = p_organization_id
            and property_id = p_property_id
            and pg_catalog.lower(code) = pg_catalog.lower(pg_catalog.btrim(v_item ->> 'code'))
        ) then
          v_rooms_existing := v_rooms_existing + 1;
        else
          perform public.create_room_with_beds(
            p_actor_user_id, p_organization_id, p_property_id, v_floor_id,
            pg_catalog.btrim(v_item ->> 'code'),
            v_item ->> 'roomType',
            (v_item ->> 'capacity')::integer,
            (v_item ->> 'defaultRent')::bigint,
            v_item ->> 'state'
          );
          v_rooms := v_rooms + 1;
          v_beds := v_beds + (v_item ->> 'capacity')::integer;
        end if;
        v_floor_id := null;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
        raise exception using errcode = v_state, message = 'Rooms row ' || coalesce(v_item ->> 'row', '?') || ': ' || v_message;
      end;
    end loop;

    for v_item in select value from pg_catalog.jsonb_array_elements(coalesce(p_residents, '[]'::jsonb)) loop
      begin
        select bed.id into v_bed_id
        from public.beds as bed
        join public.rooms as room on room.id = bed.room_id and room.organization_id = bed.organization_id
        where bed.organization_id = p_organization_id
          and bed.property_id = p_property_id
          and pg_catalog.lower(room.code) = pg_catalog.lower(pg_catalog.btrim(v_item ->> 'roomCode'))
          and pg_catalog.lower(bed.label) = pg_catalog.lower(pg_catalog.btrim(v_item ->> 'bedLabel'));

        if v_bed_id is null then
          raise exception using errcode = '22023',
            message = 'room ' || coalesce(v_item ->> 'roomCode', '?') || ' has no ' || coalesce(v_item ->> 'bedLabel', 'bed') || '. Add the room in the rooms file first.';
        end if;

        perform public.onboard_resident_to_bed(
          p_actor_user_id, p_organization_id, p_property_id, v_bed_id,
          v_item ->> 'fullName',
          v_item ->> 'phone',
          nullif(v_item ->> 'alternatePhone', ''),
          v_item ->> 'emergencyName',
          v_item ->> 'emergencyPhone',
          coalesce(v_item ->> 'address', ''),
          (v_item ->> 'moveInDate')::date,
          (v_item ->> 'monthlyRent')::bigint,
          (v_item ->> 'depositPromised')::bigint,
          (v_item ->> 'openingDue')::bigint
        );
        v_residents := v_residents + 1;
        v_opening_due := v_opening_due + (v_item ->> 'openingDue')::bigint;
        v_bed_id := null;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
        raise exception using errcode = v_state, message = 'Residents row ' || coalesce(v_item ->> 'row', '?') || ': ' || v_message;
      end;
    end loop;

    if p_dry_run then
      raise exception using errcode = 'PF001', message = 'Bulk import check completed and rolled back.';
    end if;
  exception when sqlstate 'PF001' then
    return pg_catalog.jsonb_build_object(
      'dryRun', true, 'floorsCreated', v_floors, 'roomsCreated', v_rooms, 'roomsAlreadyPresent', v_rooms_existing,
      'bedsCreated', v_beds, 'residentsOnboarded', v_residents, 'openingDueTotal', v_opening_due
    );
  end;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id, 'property.bulk_import_committed', 'property', p_property_id::text,
    pg_catalog.jsonb_build_object(
      'floorsCreated', v_floors, 'roomsCreated', v_rooms, 'roomsAlreadyPresent', v_rooms_existing,
      'bedsCreated', v_beds, 'residentsOnboarded', v_residents, 'openingDueTotal', v_opening_due
    )
  );

  return pg_catalog.jsonb_build_object(
    'dryRun', false, 'floorsCreated', v_floors, 'roomsCreated', v_rooms, 'roomsAlreadyPresent', v_rooms_existing,
    'bedsCreated', v_beds, 'residentsOnboarded', v_residents, 'openingDueTotal', v_opening_due
  );
end;
$$;

revoke all on function public.bulk_import_property(uuid, uuid, uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.bulk_import_property(uuid, uuid, uuid, jsonb, jsonb, boolean) to service_role;

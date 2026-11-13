-- Owner-managed manager accounts.
--
-- The server creates the manager's Auth user (phone + one-time password that
-- must be changed at first sign-in) and then calls add_organization_manager
-- to grant an active, property-scoped manager membership. Owners can disable
-- and re-enable managers; every change is audited.

create or replace function public.add_organization_manager(
  p_owner_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_manager_user_id uuid,
  p_display_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_display_name, ''));
  v_membership_id uuid;
  v_state public.organization_state;
begin
  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_owner_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the active property owner can add managers.';
  end if;

  if public.organization_plan_status(p_organization_id) = 'expired' then
    raise exception using errcode = 'P0001',
      message = 'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.';
  end if;

  if pg_catalog.char_length(v_name) not between 2 and 120 or v_name ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Manager name must be between 2 and 120 characters.';
  end if;
  if p_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'Enter a valid Indian mobile number.';
  end if;
  if exists (select 1 from public.platform_operators where auth_user_id = p_manager_user_id) then
    raise exception using errcode = '42501', message = 'A platform operator cannot be added as a manager.';
  end if;

  select state into v_state from public.organizations where id = p_organization_id for update;

  insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
  values (p_organization_id, p_property_id, p_manager_user_id, p_phone, v_name, 'manager', 'active')
  returning id into v_membership_id;

  -- A draft workspace is owner-only. Adding a team member opens it for operations.
  if v_state = 'draft' then
    update public.organizations set state = 'core_ready', updated_at = pg_catalog.now() where id = p_organization_id;
  end if;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_owner_user_id, 'membership.manager_added', 'membership', v_membership_id::text,
    pg_catalog.jsonb_build_object('displayName', v_name, 'role', 'manager')
  );

  return pg_catalog.jsonb_build_object('membershipId', v_membership_id, 'displayName', v_name, 'state', 'active');
end;
$$;

create or replace function public.set_organization_manager_state(
  p_owner_user_id uuid,
  p_organization_id uuid,
  p_membership_id uuid,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membership record;
begin
  if p_state not in ('active', 'disabled') then
    raise exception using errcode = '22023', message = 'Unsupported manager state.';
  end if;

  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_owner_user_id
      and organization_id = p_organization_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the active property owner can manage managers.';
  end if;

  select id, auth_user_id, state into v_membership
  from public.memberships
  where id = p_membership_id and organization_id = p_organization_id and role = 'manager'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Manager not found.';
  end if;

  if p_state = 'active' and v_membership.state <> 'active'
    and public.organization_plan_status(p_organization_id) = 'expired' then
    raise exception using errcode = 'P0001',
      message = 'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.';
  end if;

  update public.memberships set state = p_state, updated_at = pg_catalog.now() where id = p_membership_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_owner_user_id,
    case p_state when 'active' then 'membership.manager_enabled' else 'membership.manager_disabled' end,
    'membership', p_membership_id::text,
    pg_catalog.jsonb_build_object('previousState', v_membership.state, 'state', p_state)
  );

  return pg_catalog.jsonb_build_object('membershipId', p_membership_id, 'authUserId', v_membership.auth_user_id, 'state', p_state);
end;
$$;

revoke all on function public.add_organization_manager(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_organization_manager_state(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.add_organization_manager(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.set_organization_manager_state(uuid, uuid, uuid, text) to service_role;

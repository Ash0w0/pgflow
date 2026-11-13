-- Resident app access.
--
-- The server creates the resident's Auth user (phone + one-time password that
-- must be changed at first sign-in) and then calls grant_resident_app_access
-- to create an active, property-scoped tenant membership linked to exactly one
-- resident record. Owners and managers can turn access off and on. Access is
-- turned off automatically when the resident moves out, and the membership is
-- removed if the resident record itself is removed.

create or replace function public.grant_resident_app_access(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_resident_id uuid,
  p_resident_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resident record;
  v_membership_id uuid;
begin
  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role in ('owner', 'manager')
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the owner or a manager can give residents app access.';
  end if;

  if public.organization_plan_status(p_organization_id) = 'expired' then
    raise exception using errcode = 'P0001',
      message = 'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.';
  end if;

  if p_resident_user_id is null
    or exists (select 1 from public.platform_operators where auth_user_id = p_resident_user_id)
    or exists (select 1 from public.memberships where auth_user_id = p_resident_user_id)
  then
    raise exception using errcode = '42501', message = 'This login cannot be used for a resident.';
  end if;

  select id, full_name, phone, state, membership_id into v_resident
  from public.tenant_profiles
  where organization_id = p_organization_id and property_id = p_property_id and id = p_resident_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Resident not found.';
  end if;
  if v_resident.state not in ('active', 'notice') then
    raise exception using errcode = 'P0001', message = 'Only current residents can be given app access.';
  end if;
  if v_resident.membership_id is not null then
    raise exception using errcode = 'P0001', message = 'This resident already has app access.';
  end if;

  insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
  values (p_organization_id, p_property_id, p_resident_user_id, v_resident.phone, v_resident.full_name, 'tenant', 'active')
  returning id into v_membership_id;

  update public.tenant_profiles
  set membership_id = v_membership_id, updated_at = pg_catalog.now()
  where organization_id = p_organization_id and id = p_resident_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id, 'resident.app_access_granted', 'tenant_profile', p_resident_id::text,
    pg_catalog.jsonb_build_object('membershipId', v_membership_id)
  );

  return pg_catalog.jsonb_build_object('membershipId', v_membership_id, 'state', 'active');
end;
$$;

create or replace function public.set_resident_app_access_state(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_resident_id uuid,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resident record;
  v_membership record;
begin
  if p_state not in ('active', 'disabled') then
    raise exception using errcode = '22023', message = 'Unsupported access state.';
  end if;

  select id, property_id, state, membership_id into v_resident
  from public.tenant_profiles
  where organization_id = p_organization_id and id = p_resident_id
  for update;
  if not found or v_resident.membership_id is null then
    raise exception using errcode = 'P0002', message = 'This resident has no app access yet.';
  end if;

  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = v_resident.property_id
      and role in ('owner', 'manager')
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the owner or a manager can change resident app access.';
  end if;

  if p_state = 'active' and v_resident.state not in ('active', 'notice') then
    raise exception using errcode = 'P0001', message = 'Only current residents can use the app.';
  end if;
  if p_state = 'active' and public.organization_plan_status(p_organization_id) = 'expired' then
    raise exception using errcode = 'P0001',
      message = 'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.';
  end if;

  select id, auth_user_id, state into v_membership
  from public.memberships
  where organization_id = p_organization_id and id = v_resident.membership_id and role = 'tenant'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'This resident has no app access yet.';
  end if;

  update public.memberships set state = p_state, updated_at = pg_catalog.now() where id = v_membership.id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id,
    case p_state when 'active' then 'resident.app_access_enabled' else 'resident.app_access_disabled' end,
    'tenant_profile', p_resident_id::text,
    pg_catalog.jsonb_build_object('previousState', v_membership.state, 'state', p_state)
  );

  return pg_catalog.jsonb_build_object('membershipId', v_membership.id, 'authUserId', v_membership.auth_user_id, 'state', p_state);
end;
$$;

-- A resident who has left can no longer sign in.
create or replace function public.disable_departed_resident_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.membership_id is not null and new.state in ('moved_out', 'archived') then
    update public.memberships
    set state = 'disabled', updated_at = pg_catalog.now()
    where organization_id = new.organization_id and id = new.membership_id and role = 'tenant';
  end if;
  return new;
end;
$$;

drop trigger if exists tenant_profiles_disable_departed_access on public.tenant_profiles;
create trigger tenant_profiles_disable_departed_access
after update of state on public.tenant_profiles
for each row execute function public.disable_departed_resident_access();

-- Removing a resident record (an undone onboarding) removes its membership too.
create or replace function public.remove_deleted_resident_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.membership_id is not null then
    delete from public.memberships
    where organization_id = old.organization_id and id = old.membership_id and role = 'tenant';
  end if;
  return old;
end;
$$;

drop trigger if exists tenant_profiles_remove_deleted_access on public.tenant_profiles;
create trigger tenant_profiles_remove_deleted_access
after delete on public.tenant_profiles
for each row execute function public.remove_deleted_resident_access();

revoke all on function public.grant_resident_app_access(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_resident_app_access_state(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.disable_departed_resident_access() from public, anon, authenticated;
revoke all on function public.remove_deleted_resident_access() from public, anon, authenticated;
grant execute on function public.grant_resident_app_access(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.set_resident_app_access_state(uuid, uuid, uuid, text) to service_role;

-- Residents serving notice still owe rent, so they can submit payment proof
-- from the app too. Identical to the 0021 definition except for that one check.
create or replace function public.submit_upi_payment_evidence(
  p_actor_user_id uuid, p_organization_id uuid, p_property_id uuid, p_invoice_id uuid,
  p_amount bigint, p_reference text, p_paid_at timestamptz,
  p_object_key text, p_content_type text, p_file_hash text, p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_payment_id uuid := extensions.gen_random_uuid(); v_reference text := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p_reference),'[^A-Za-z0-9]','','g')); v_tenant_id uuid; v_role public.membership_role;
begin
  select role into v_role from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id and property_id=p_property_id and state='active';
  if v_role is null or v_role not in ('owner','manager','accountant','tenant') then raise exception using errcode='42501', message='An active PG account is required.'; end if;
  select * into v_invoice from public.invoices where organization_id=p_organization_id and property_id=p_property_id and id=p_invoice_id for update;
  if not found or v_invoice.state not in ('issued','partially_paid','overdue') then raise exception using errcode='P0001', message='This invoice cannot accept payment evidence.'; end if;
  if v_role='tenant' then
    select id into v_tenant_id from public.tenant_profiles where organization_id=p_organization_id and property_id=p_property_id and membership_id=(select id from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id) and state in ('active','notice');
    if v_tenant_id is null or v_tenant_id<>v_invoice.tenant_id then raise exception using errcode='42501', message='This invoice does not belong to the tenant.'; end if;
  end if;
  if p_amount<=0 or p_amount>(v_invoice.total_amount-v_invoice.paid_amount) then raise exception using errcode='22023', message='Amount must not exceed the outstanding balance.'; end if;
  if v_reference !~ '^[A-Z0-9]{6,35}$' or p_paid_at < pg_catalog.now()-interval '90 days' or p_paid_at > pg_catalog.now()+interval '1 day' then raise exception using errcode='22023', message='Payment reference or date is invalid.'; end if;
  if p_file_hash !~ '^[a-f0-9]{64}$' or p_content_type not in ('image/jpeg','image/png','image/webp') or p_object_key !~ ('^organizations/'||p_organization_id::text||'/payment-evidence/[^/]+$') then raise exception using errcode='22023', message='Screenshot evidence is invalid.'; end if;
  insert into public.payments(id,organization_id,property_id,tenant_id,invoice_id,method,amount,reference,state,paid_at,submitted_by,note)
  values(v_payment_id,p_organization_id,p_property_id,v_invoice.tenant_id,p_invoice_id,'upi',p_amount,v_reference,'pending_review',p_paid_at,p_actor_user_id,pg_catalog.left(pg_catalog.btrim(p_note),500));
  insert into public.payment_evidence(organization_id,payment_id,object_key,content_type,file_hash) values(p_organization_id,v_payment_id,p_object_key,p_content_type,p_file_hash);
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'payment.upi_submitted','payment',v_payment_id::text,pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'amount',p_amount,'state','pending_review'));
  return pg_catalog.jsonb_build_object('paymentId',v_payment_id,'state','pending_review','autoApproved',false);
end $$;

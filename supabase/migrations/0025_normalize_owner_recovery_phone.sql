-- Normalize phone number comparisons across Auth and Membership in owner password recovery RPC functions.
-- Supabase Auth can store user phone numbers in canonical E.164 form without the optional leading "+".
-- This forward-only migration normalizes phone strings on both sides of every comparison so active owners
-- can be located and verified consistently.

create or replace function public.issue_owner_password_recovery(
  p_operator_user_id uuid,
  p_organization_id uuid,
  p_credential_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_owner record;
  v_recovery_id uuid;
begin
  if p_operator_user_id is null
    or p_organization_id is null
    or p_credential_hash is null
    or p_credential_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at < v_now + interval '5 minutes'
    or p_expires_at > v_now + interval '24 hours'
  then
    raise exception using errcode = '22023', message = 'Invalid owner recovery parameters.';
  end if;

  perform 1
  from public.platform_operators as operator
  where operator.auth_user_id = p_operator_user_id
    and operator.state = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Active platform operator authorization is required.';
  end if;

  select
    membership.id as membership_id,
    membership.auth_user_id,
    membership.phone,
    membership.display_name
  into strict v_owner
  from public.memberships as membership
  join public.organizations as organization
    on organization.id = membership.organization_id
  join auth.users as auth_user
    on auth_user.id = membership.auth_user_id
  where membership.organization_id = p_organization_id
    and membership.role = 'owner'
    and membership.state = 'active'
    and organization.state not in ('suspended', 'archived')
    and not organization.demo_mode
    and auth_user.phone_confirmed_at is not null
    and pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(auth_user.phone, '')), '^\+', '') =
        pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(membership.phone, '')), '^\+', '')
  for update of membership;

  update public.owner_password_recoveries as recovery
  set state = 'revoked',
      credential_hash = null,
      revoked_at = v_now,
      updated_at = v_now
  where recovery.organization_id = p_organization_id
    and recovery.auth_user_id = v_owner.auth_user_id
    and recovery.state in ('issued', 'processing');

  insert into public.owner_password_recoveries (
    organization_id,
    membership_id,
    auth_user_id,
    phone,
    credential_hash,
    state,
    issued_by,
    issued_at,
    expires_at,
    updated_at
  ) values (
    p_organization_id,
    v_owner.membership_id,
    v_owner.auth_user_id,
    v_owner.phone,
    p_credential_hash,
    'issued',
    p_operator_user_id,
    v_now,
    p_expires_at,
    v_now
  ) returning id into v_recovery_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    p_operator_user_id,
    'owner_password_recovery.issued',
    'owner_password_recovery',
    v_recovery_id::text,
    pg_catalog.jsonb_build_object(
      'membershipId', v_owner.membership_id,
      'authUserId', v_owner.auth_user_id,
      'expiresAt', p_expires_at,
      'manualPhoneConfirmation', true
    )
  );

  return pg_catalog.jsonb_build_object(
    'recoveryId', v_recovery_id,
    'organizationId', p_organization_id,
    'membershipId', v_owner.membership_id,
    'authUserId', v_owner.auth_user_id,
    'displayName', v_owner.display_name,
    'phone', v_owner.phone,
    'expiresAt', p_expires_at,
    'state', 'issued'
  );
end;
$function$;

create or replace function public.claim_owner_password_recovery(
  p_organization_id uuid,
  p_phone text,
  p_credential_hash text,
  p_recovery_request_id uuid,
  p_password_intent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_recovery public.owner_password_recoveries%rowtype;
begin
  if p_organization_id is null
    or p_phone is null
    or p_phone !~ '^\+91[6-9][0-9]{9}$'
    or p_credential_hash is null
    or p_credential_hash !~ '^[0-9a-f]{64}$'
    or p_recovery_request_id is null
    or p_password_intent_hash is null
    or p_password_intent_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Invalid owner recovery credentials.';
  end if;

  select recovery.*
  into strict v_recovery
  from public.owner_password_recoveries as recovery
  where recovery.organization_id = p_organization_id
    and pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(recovery.phone, '')), '^\+', '') =
        pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_phone, '')), '^\+', '')
    and recovery.state in ('issued', 'processing')
  for update;

  if v_recovery.expires_at <= v_now
    or v_recovery.credential_hash <> p_credential_hash
  then
    raise exception using errcode = '22023', message = 'Owner recovery credentials are invalid or expired.';
  end if;

  if v_recovery.state = 'issued' then
    update public.owner_password_recoveries as recovery
    set state = 'processing',
        recovery_request_id = p_recovery_request_id,
        password_intent_hash = p_password_intent_hash,
        claimed_at = v_now,
        updated_at = v_now
    where recovery.id = v_recovery.id
      and recovery.state = 'issued';
    if not found then
      raise exception using errcode = 'P0001', message = 'Owner recovery was claimed by another request.';
    end if;
  elsif v_recovery.recovery_request_id <> p_recovery_request_id
    or v_recovery.password_intent_hash <> p_password_intent_hash
  then
    raise exception using errcode = 'P0001', message = 'Owner recovery is already processing another request.';
  end if;

  return pg_catalog.jsonb_build_object(
    'recoveryId', v_recovery.id,
    'organizationId', v_recovery.organization_id,
    'membershipId', v_recovery.membership_id,
    'authUserId', v_recovery.auth_user_id,
    'phone', v_recovery.phone,
    'recoveryRequestId', p_recovery_request_id,
    'passwordIntentHash', p_password_intent_hash,
    'state', 'processing'
  );
end;
$function$;

create or replace function public.complete_owner_password_recovery(
  p_recovery_id uuid,
  p_auth_user_id uuid,
  p_recovery_request_id uuid,
  p_password_intent_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_recovery public.owner_password_recoveries%rowtype;
begin
  if p_recovery_id is null
    or p_auth_user_id is null
    or p_recovery_request_id is null
    or p_password_intent_hash is null
    or p_password_intent_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'Invalid owner recovery completion.';
  end if;

  select recovery.*
  into strict v_recovery
  from public.owner_password_recoveries as recovery
  where recovery.id = p_recovery_id
    and recovery.auth_user_id = p_auth_user_id
  for update;

  if v_recovery.state = 'completed'
    and v_recovery.recovery_request_id = p_recovery_request_id
    and v_recovery.password_intent_hash = p_password_intent_hash
  then
    return pg_catalog.jsonb_build_object('recoveryId', v_recovery.id, 'state', 'completed');
  end if;

  if v_recovery.state <> 'processing'
    or v_recovery.recovery_request_id <> p_recovery_request_id
    or v_recovery.password_intent_hash <> p_password_intent_hash
    or not exists (
      select 1
      from public.memberships as membership
      join auth.users as auth_user on auth_user.id = membership.auth_user_id
      where membership.id = v_recovery.membership_id
        and membership.organization_id = v_recovery.organization_id
        and membership.auth_user_id = v_recovery.auth_user_id
        and membership.role = 'owner'
        and membership.state = 'active'
        and pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(auth_user.phone, '')), '^\+', '') =
            pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(v_recovery.phone, '')), '^\+', '')
    )
  then
    raise exception using errcode = 'P0001', message = 'Owner recovery is no longer current.';
  end if;

  update public.owner_password_recoveries as recovery
  set state = 'completed',
      credential_hash = null,
      completed_at = v_now,
      updated_at = v_now
  where recovery.id = v_recovery.id
    and recovery.state = 'processing';
  if not found then
    raise exception using errcode = 'P0001', message = 'Owner recovery could not be completed.';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    v_recovery.organization_id,
    p_auth_user_id,
    'owner_password_recovery.completed',
    'owner_password_recovery',
    v_recovery.id::text,
    pg_catalog.jsonb_build_object(
      'membershipId', v_recovery.membership_id,
      'authUserId', p_auth_user_id,
      'recoveryRequestId', p_recovery_request_id,
      'sessionsRevokedByApplication', true
    )
  );

  return pg_catalog.jsonb_build_object(
    'recoveryId', v_recovery.id,
    'organizationId', v_recovery.organization_id,
    'state', 'completed'
  );
end;
$function$;

revoke all on function public.issue_owner_password_recovery(uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_owner_password_recovery(uuid, uuid, text, timestamptz)
  to service_role;

revoke all on function public.claim_owner_password_recovery(uuid, text, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_owner_password_recovery(uuid, text, text, uuid, text)
  to service_role;

revoke all on function public.complete_owner_password_recovery(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_owner_password_recovery(uuid, uuid, uuid, text)
  to service_role;

comment on function public.issue_owner_password_recovery(uuid, uuid, text, timestamptz) is
  'Operator-issued owner password recovery with normalized E.164 phone matching.';

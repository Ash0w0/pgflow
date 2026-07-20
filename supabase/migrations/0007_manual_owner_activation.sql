-- Manual, concierge activation for the first PG owner.
--
-- A high-entropy temporary password is generated and verified by the server.
-- PostgreSQL receives only its lowercase SHA-256 digest and expiry metadata.
-- The Auth user is created with the owner's final password only after that
-- verification, immediately before complete_manual_owner_activation runs.

alter table public.staff_invitations
  add column activation_auth_user_id uuid,
  add column activation_request_id uuid,
  add column auth_user_id uuid references auth.users(id) on delete restrict,
  add column credential_state text not null default 'not_issued',
  add column credential_issued_at timestamptz,
  add column temporary_password_hash text,
  add column temporary_password_expires_at timestamptz,
  add column manual_phone_confirmed_at timestamptz,
  add column manual_phone_confirmed_by uuid
    references public.platform_operators(auth_user_id) on delete restrict;

alter table public.staff_invitations
  add constraint staff_invitations_credential_state_check
    check (credential_state in ('not_issued', 'temporary', 'activated')),
  add constraint staff_invitations_manual_credential_consistency_check
    check (
      (
        credential_state = 'not_issued'
        and activation_auth_user_id is null
        and activation_request_id is null
        and auth_user_id is null
        and credential_issued_at is null
        and temporary_password_hash is null
        and temporary_password_expires_at is null
        and manual_phone_confirmed_at is null
        and manual_phone_confirmed_by is null
        and state in ('pending', 'revoked', 'expired')
      )
      or (
        credential_state = 'temporary'
        and state = 'pending'
        and activation_auth_user_id is not null
        and activation_request_id is null
        and auth_user_id is null
        and credential_issued_at is not null
        and temporary_password_hash ~ '^[0-9a-f]{64}$'
        and temporary_password_expires_at is not null
        and temporary_password_expires_at > credential_issued_at
        and temporary_password_expires_at <= credential_issued_at + interval '24 hours'
        and manual_phone_confirmed_at is not null
        and manual_phone_confirmed_by is not null
        and manual_phone_confirmed_at <= credential_issued_at
      )
      or (
        credential_state = 'activated'
        and state = 'accepted'
        and activation_auth_user_id is not null
        and activation_request_id is not null
        and auth_user_id is not null
        and activation_auth_user_id = auth_user_id
        and credential_issued_at is not null
        and temporary_password_hash is null
        and temporary_password_expires_at is null
        and manual_phone_confirmed_at is not null
        and manual_phone_confirmed_by is not null
        and manual_phone_confirmed_at <= credential_issued_at
        and accepted_by = auth_user_id
        and accepted_at is not null
        and accepted_at >= credential_issued_at
      )
    );

create unique index staff_invitations_org_auth_user_id_uq
  on public.staff_invitations (organization_id, auth_user_id)
  where auth_user_id is not null;

create unique index staff_invitations_activation_auth_user_id_uq
  on public.staff_invitations (activation_auth_user_id)
  where activation_auth_user_id is not null;

-- An owner may own multiple PG organizations, but a PG has exactly one current
-- owner authority during the concierge MVP. The existing membership unique key
-- already prevents one Auth identity appearing twice in the same organization.
create unique index memberships_one_current_owner_per_org_uq
  on public.memberships (organization_id)
  where role = 'owner' and state in ('invited', 'active');

comment on column public.staff_invitations.expires_at is
  'Invitation staging expiry. After a manual credential is issued, temporary_password_expires_at is authoritative.';

comment on column public.staff_invitations.temporary_password_expires_at is
  'Authoritative manual credential expiry after issue/reset; null before issue and after activation.';

comment on column public.staff_invitations.activation_auth_user_id is
  'Database-owned stable Auth user UUID for idempotent manual activation retries; assigned at credential issue.';

comment on column public.staff_invitations.activation_request_id is
  'Winning HTTP activation request UUID; persisted only when Auth and owner membership commit together.';

-- create_owner_invitation from migration 0006 can replace a pending invitation.
-- Clear any issued digest before its state becomes revoked so replacement stays
-- compatible with the credential-state invariant and cannot retain a usable
-- credential. This also protects future explicit pending-to-expired updates.
create or replace function public.clear_staff_invitation_credential_on_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state in ('revoked', 'expired') and old.state = 'pending' then
    new.activation_auth_user_id := null;
    new.activation_request_id := null;
    new.auth_user_id := null;
    new.credential_state := 'not_issued';
    new.credential_issued_at := null;
    new.temporary_password_hash := null;
    new.temporary_password_expires_at := null;
    new.manual_phone_confirmed_at := null;
    new.manual_phone_confirmed_by := null;
  end if;

  return new;
end;
$$;

create trigger staff_invitations_clear_credential_on_close
before update on public.staff_invitations
for each row execute function public.clear_staff_invitation_credential_on_close();

revoke all on function public.clear_staff_invitation_credential_on_close()
  from public, anon, authenticated, service_role;

create or replace function public.issue_manual_owner_credential(
  p_operator_user_id uuid,
  p_invitation_id uuid,
  p_temporary_password_hash text,
  p_temporary_password_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_temporary_password_hash text := pg_catalog.btrim(p_temporary_password_hash);
  v_invitation record;
  v_persisted record;
begin
  if p_operator_user_id is null or p_invitation_id is null then
    raise exception using errcode = '22023', message = 'Operator and invitation IDs are required.';
  end if;

  if v_temporary_password_hash is null
    or v_temporary_password_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'A lowercase SHA-256 temporary credential hash is required.';
  end if;

  if p_temporary_password_expires_at is null
    or p_temporary_password_expires_at < v_now + interval '5 minutes'
    or p_temporary_password_expires_at > v_now + interval '24 hours'
  then
    raise exception using errcode = '22023', message = 'Temporary credentials must expire between 5 minutes and 24 hours.';
  end if;

  if not exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_operator_user_id
      and platform_operator.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active platform operator is required.';
  end if;

  perform 1
  from public.organizations as organization
  join public.staff_invitations as invitation
    on invitation.organization_id = organization.id
  where invitation.id = p_invitation_id
    and organization.state = 'draft'
    and not organization.demo_mode
  for update of organization;

  if not found then
    raise exception using errcode = '22023', message = 'Manual owner credentials require a non-demo draft organization.';
  end if;

  select
    invitation.id,
    invitation.organization_id,
    invitation.property_id,
    invitation.state,
    invitation.role,
    invitation.expires_at,
    invitation.credential_state,
    invitation.activation_auth_user_id,
    invitation.temporary_password_hash,
    invitation.temporary_password_expires_at
  into strict v_invitation
  from public.staff_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if v_invitation.role <> 'owner'
    or v_invitation.state <> 'pending'
    or v_invitation.expires_at <= v_now
  then
    raise exception using errcode = '22023', message = 'A current pending owner invitation is required.';
  end if;

  -- An exact retry is idempotent. A different digest or expiry must use the
  -- explicit reset RPC so rotation is separately audited.
  if v_invitation.credential_state = 'temporary' then
    if v_invitation.temporary_password_hash = v_temporary_password_hash
      and v_invitation.temporary_password_expires_at = p_temporary_password_expires_at
    then
      return pg_catalog.jsonb_build_object(
        'invitationId', v_invitation.id,
        'organizationId', v_invitation.organization_id,
        'propertyId', v_invitation.property_id,
        'activationAuthUserId', v_invitation.activation_auth_user_id,
        'credentialState', 'temporary',
        'temporaryPasswordExpiresAt', v_invitation.temporary_password_expires_at
      );
    end if;

    raise exception using errcode = 'P0001', message = 'A temporary owner credential is already issued.';
  end if;

  if v_invitation.credential_state <> 'not_issued' then
    raise exception using errcode = 'P0001', message = 'The owner invitation cannot receive temporary credentials.';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = v_invitation.organization_id
      and membership.role = 'owner'
      and membership.state in ('invited', 'active')
  ) then
    raise exception using errcode = 'P0001', message = 'The organization already has current owner authority.';
  end if;

  update public.staff_invitations as invitation
  set
    activation_auth_user_id = pg_catalog.gen_random_uuid(),
    credential_state = 'temporary',
    credential_issued_at = v_now,
    temporary_password_hash = v_temporary_password_hash,
    temporary_password_expires_at = p_temporary_password_expires_at,
    manual_phone_confirmed_at = v_now,
    manual_phone_confirmed_by = p_operator_user_id
  where invitation.id = p_invitation_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  values (
    v_invitation.organization_id,
    p_operator_user_id,
    'owner_credential.issued',
    'staff_invitation',
    p_invitation_id::text,
    pg_catalog.jsonb_build_object(
      'invitationId', p_invitation_id,
      'credentialState', 'temporary',
      'temporaryPasswordExpiresAt', p_temporary_password_expires_at,
      'manualPhoneConfirmed', true
    )
  );

  select
    invitation.id,
    invitation.organization_id,
    invitation.property_id,
    invitation.activation_auth_user_id,
    invitation.credential_state,
    invitation.temporary_password_expires_at
  into strict v_persisted
  from public.staff_invitations as invitation
  where invitation.id = p_invitation_id;

  return pg_catalog.jsonb_build_object(
    'invitationId', v_persisted.id,
    'organizationId', v_persisted.organization_id,
    'propertyId', v_persisted.property_id,
    'activationAuthUserId', v_persisted.activation_auth_user_id,
    'credentialState', v_persisted.credential_state,
    'temporaryPasswordExpiresAt', v_persisted.temporary_password_expires_at
  );
end;
$$;

create or replace function public.reset_manual_owner_credential(
  p_operator_user_id uuid,
  p_organization_id uuid,
  p_expected_activation_auth_user_id uuid,
  p_temporary_password_hash text,
  p_temporary_password_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_temporary_password_hash text := pg_catalog.btrim(p_temporary_password_hash);
  v_activation_auth_user_id uuid;
  v_invitation record;
begin
  if p_operator_user_id is null
    or p_organization_id is null
    or p_expected_activation_auth_user_id is null
  then
    raise exception using errcode = '22023', message = 'Operator, organization, and expected credential IDs are required.';
  end if;

  if v_temporary_password_hash is null
    or v_temporary_password_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'A lowercase SHA-256 temporary credential hash is required.';
  end if;

  if p_temporary_password_expires_at is null
    or p_temporary_password_expires_at < v_now + interval '5 minutes'
    or p_temporary_password_expires_at > v_now + interval '24 hours'
  then
    raise exception using errcode = '22023', message = 'Temporary credentials must expire between 5 minutes and 24 hours.';
  end if;

  if not exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_operator_user_id
      and platform_operator.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active platform operator is required.';
  end if;

  perform 1
  from public.organizations as organization
  where organization.id = p_organization_id
    and organization.state = 'draft'
    and not organization.demo_mode
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Manual owner credential reset requires a non-demo draft organization.';
  end if;

  select
    invitation.id,
    invitation.organization_id,
    invitation.property_id,
    invitation.activation_auth_user_id,
    invitation.credential_state
  into strict v_invitation
  from public.staff_invitations as invitation
  where invitation.organization_id = p_organization_id
    and invitation.role = 'owner'
    and invitation.state = 'pending'
    and invitation.credential_state = 'temporary'
    and invitation.activation_auth_user_id = p_expected_activation_auth_user_id
    and invitation.auth_user_id is null
  for update;

  if exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.role = 'owner'
      and membership.state in ('invited', 'active')
  ) then
    raise exception using errcode = 'P0001', message = 'Only an unactivated owner credential can be reset.';
  end if;

  update public.staff_invitations as invitation
  set
    activation_auth_user_id = pg_catalog.gen_random_uuid(),
    activation_request_id = null,
    credential_issued_at = v_now,
    temporary_password_hash = v_temporary_password_hash,
    temporary_password_expires_at = p_temporary_password_expires_at,
    manual_phone_confirmed_at = v_now,
    manual_phone_confirmed_by = p_operator_user_id
  where invitation.id = v_invitation.id
    and invitation.state = 'pending'
    and invitation.credential_state = 'temporary'
    and invitation.activation_auth_user_id = p_expected_activation_auth_user_id
  returning invitation.activation_auth_user_id into v_activation_auth_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'Exactly one temporary owner credential is required.';
  end if;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  values (
    p_organization_id,
    p_operator_user_id,
    'owner_credential.reset',
    'staff_invitation',
    v_invitation.id::text,
    pg_catalog.jsonb_build_object(
      'invitationId', v_invitation.id,
      'credentialState', 'temporary',
      'temporaryPasswordExpiresAt', p_temporary_password_expires_at,
      'manualPhoneConfirmed', true
    )
  );

  return pg_catalog.jsonb_build_object(
    'invitationId', v_invitation.id,
    'organizationId', p_organization_id,
    'propertyId', v_invitation.property_id,
    'activationAuthUserId', v_activation_auth_user_id,
    'credentialState', 'temporary',
    'temporaryPasswordExpiresAt', p_temporary_password_expires_at
  );
end;
$$;

create or replace function public.complete_manual_owner_activation(
  p_auth_user_id uuid,
  p_organization_id uuid,
  p_invitation_id uuid,
  p_activation_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_invitation record;
  v_membership_id uuid;
  v_step_ids uuid[];
  v_step_id uuid;
begin
  if p_auth_user_id is null
    or p_organization_id is null
    or p_invitation_id is null
    or p_activation_request_id is null
  then
    raise exception using errcode = '22023', message = 'Auth user, organization, invitation, and activation request IDs are required.';
  end if;

  perform 1
  from public.organizations as organization
  where organization.id = p_organization_id
    and organization.state = 'draft'
    and not organization.demo_mode
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Manual owner activation requires a non-demo draft organization.';
  end if;

  select
    invitation.id,
    invitation.organization_id,
    invitation.property_id,
    invitation.display_name,
    invitation.phone,
    invitation.activation_auth_user_id,
    invitation.credential_issued_at,
    invitation.temporary_password_expires_at,
    invitation.manual_phone_confirmed_at,
    invitation.manual_phone_confirmed_by
  into strict v_invitation
  from public.staff_invitations as invitation
  where invitation.id = p_invitation_id
    and invitation.organization_id = p_organization_id
    and invitation.role = 'owner'
    and invitation.state = 'pending'
    and invitation.credential_state = 'temporary'
    and invitation.auth_user_id is null
  for update;

  if v_invitation.temporary_password_expires_at <= v_now then
    raise exception using errcode = '22023', message = 'Temporary owner credentials have expired.';
  end if;

  if v_invitation.activation_auth_user_id is null
    or v_invitation.activation_auth_user_id <> p_auth_user_id
  then
    raise exception using errcode = '22023', message = 'The Auth user must match the stable activation attempt.';
  end if;

  if v_invitation.manual_phone_confirmed_at is null
    or v_invitation.manual_phone_confirmed_by is null
    or not exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = p_auth_user_id
        and pg_catalog.btrim(auth_user.phone) = v_invitation.phone
        and auth_user.phone_confirmed_at is not null
        and auth_user.raw_app_meta_data @> pg_catalog.jsonb_build_object(
          'pgflow_activation', 'manual_owner',
          'pgflow_invitation_id', p_invitation_id::text,
          'pgflow_organization_id', p_organization_id::text,
          'pgflow_phone_confirmation', 'manual_operator',
          'pgflow_activation_request_id', p_activation_request_id::text
        )
    )
  then
    raise exception using errcode = '22023', message = 'The Auth user must match the manually confirmed owner activation record.';
  end if;

  if exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_auth_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'A platform operator identity cannot become a PG owner.';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.auth_user_id = p_auth_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'The Auth user already belongs to this organization.';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.role = 'owner'
      and membership.state in ('invited', 'active')
  ) then
    raise exception using errcode = 'P0001', message = 'The organization already has current owner authority.';
  end if;

  select pg_catalog.array_agg(provisioning_step.id order by provisioning_job.created_at)
  into v_step_ids
  from public.provisioning_steps as provisioning_step
  join public.provisioning_jobs as provisioning_job
    on provisioning_job.id = provisioning_step.job_id
    and provisioning_job.organization_id = provisioning_step.organization_id
  where provisioning_step.organization_id = p_organization_id
    and provisioning_step.key = 'owner_account';

  if coalesce(pg_catalog.cardinality(v_step_ids), 0) <> 1 then
    raise exception using errcode = 'P0001', message = 'Exactly one owner-account provisioning step is required.';
  end if;

  v_step_id := v_step_ids[1];

  perform 1
  from public.provisioning_steps as provisioning_step
  where provisioning_step.id = v_step_id
    and provisioning_step.state in ('pending', 'running', 'failed')
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'The owner-account provisioning step cannot be completed.';
  end if;

  insert into public.memberships (
    organization_id,
    property_id,
    auth_user_id,
    phone,
    display_name,
    role,
    state,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    v_invitation.property_id,
    p_auth_user_id,
    v_invitation.phone,
    v_invitation.display_name,
    'owner',
    'active',
    v_now,
    v_now
  )
  returning id into v_membership_id;

  update public.staff_invitations as invitation
  set
    state = 'accepted',
    accepted_by = p_auth_user_id,
    accepted_at = v_now,
    auth_user_id = p_auth_user_id,
    activation_request_id = p_activation_request_id,
    credential_state = 'activated',
    temporary_password_hash = null,
    temporary_password_expires_at = null
  where invitation.id = p_invitation_id
    and invitation.state = 'pending'
    and invitation.credential_state = 'temporary'
    and invitation.activation_auth_user_id = p_auth_user_id
    and invitation.activation_request_id is null
    and invitation.auth_user_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'Exactly one temporary owner invitation is required.';
  end if;

  update public.provisioning_steps as provisioning_step
  set
    state = 'passed',
    started_at = coalesce(provisioning_step.started_at, v_now),
    finished_at = v_now,
    safe_error_code = null,
    safe_error_message = null
  where provisioning_step.id = v_step_id;

  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  values (
    p_organization_id,
    p_auth_user_id,
    'owner_activation.completed',
    'membership',
    v_membership_id::text,
    pg_catalog.jsonb_build_object(
      'invitationId', p_invitation_id,
      'membershipId', v_membership_id,
      'authUserId', p_auth_user_id,
      'activationRequestId', p_activation_request_id,
      'credentialState', 'activated',
      'membershipState', 'active',
      'ownerAccountStep', 'passed'
    )
  );

  return pg_catalog.jsonb_build_object(
    'invitationId', p_invitation_id,
    'membershipId', v_membership_id,
    'organizationId', p_organization_id,
    'activationRequestId', p_activation_request_id,
    'credentialState', 'activated',
    'membershipState', 'active'
  );
end;
$$;

-- Supabase Auth and application authority are committed in one PostgreSQL
-- transaction. Any guarded trigger failure rolls back the auth.users write, so
-- a crash cannot leave a phone-blocking provisional user without membership.
create or replace function public.complete_manual_owner_activation_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id_text text;
  v_organization_id_text text;
  v_activation_request_id_text text;
  v_invitation_id uuid;
  v_organization_id uuid;
  v_activation_request_id uuid;
  v_invitation record;
begin
  if coalesce(new.raw_app_meta_data ->> 'pgflow_activation', '') <> 'manual_owner' then
    return new;
  end if;

  -- GoTrue can populate manual metadata before phone_confirmed_at during
  -- admin.createUser. Both writes occur in one transaction; the targeted
  -- UPDATE trigger below completes activation once confirmation is present.
  if new.phone_confirmed_at is null then
    return new;
  end if;

  v_invitation_id_text := pg_catalog.btrim(new.raw_app_meta_data ->> 'pgflow_invitation_id');
  v_organization_id_text := pg_catalog.btrim(new.raw_app_meta_data ->> 'pgflow_organization_id');
  v_activation_request_id_text := pg_catalog.btrim(new.raw_app_meta_data ->> 'pgflow_activation_request_id');

  if coalesce(new.raw_app_meta_data ->> 'pgflow_phone_confirmation', '') <> 'manual_operator'
    or v_invitation_id_text is null
    or v_invitation_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_organization_id_text is null
    or v_organization_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_activation_request_id_text is null
    or v_activation_request_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023', message = 'Manual owner Auth metadata is invalid.';
  end if;

  v_invitation_id := v_invitation_id_text::uuid;
  v_organization_id := v_organization_id_text::uuid;
  v_activation_request_id := v_activation_request_id_text::uuid;

  select
    invitation.state,
    invitation.credential_state,
    invitation.activation_auth_user_id,
    invitation.activation_request_id,
    invitation.auth_user_id,
    invitation.phone
  into strict v_invitation
  from public.staff_invitations as invitation
  where invitation.id = v_invitation_id
    and invitation.organization_id = v_organization_id;

  if v_invitation.state = 'accepted'
    and v_invitation.credential_state = 'activated'
    and v_invitation.activation_auth_user_id = new.id
    and v_invitation.activation_request_id = v_activation_request_id
    and v_invitation.auth_user_id = new.id
    and pg_catalog.btrim(new.phone) = v_invitation.phone
    and new.phone_confirmed_at is not null
  then
    return new;
  end if;

  if v_invitation.state <> 'pending'
    or v_invitation.credential_state <> 'temporary'
    or v_invitation.activation_auth_user_id <> new.id
    or v_invitation.activation_request_id is not null
  then
    raise exception using errcode = 'P0001', message = 'The manual owner activation attempt is no longer current.';
  end if;

  perform public.complete_manual_owner_activation(
    new.id,
    v_organization_id,
    v_invitation_id,
    v_activation_request_id
  );

  return new;
end;
$$;

revoke all on function public.complete_manual_owner_activation_on_auth_user()
  from public, anon, authenticated, service_role;

create trigger auth_user_complete_manual_owner_activation
after insert or update of phone, phone_confirmed_at, raw_app_meta_data on auth.users
for each row execute function public.complete_manual_owner_activation_on_auth_user();

revoke all on function public.issue_manual_owner_credential(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.reset_manual_owner_credential(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

revoke all on function public.complete_manual_owner_activation(
  uuid,
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.issue_manual_owner_credential(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;

grant execute on function public.reset_manual_owner_credential(
  uuid,
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;

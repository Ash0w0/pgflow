-- An onboarding draft can have one successfully activated owner while still
-- containing no operational PG data. Allow that exact blank-shell case to be
-- restarted by removing its unshared, non-operator Auth identity atomically
-- with the draft. Any shared authority, recovery, file, or business record
-- remains a hard refusal.

create or replace function public.delete_empty_draft_organization(
  p_operator_user_id uuid,
  p_organization_id uuid,
  p_confirmation_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_organization record;
  v_membership_count integer;
  v_invitation_count integer;
  v_owner_auth_user_id uuid;
begin
  if p_operator_user_id is null or p_organization_id is null then
    raise exception using errcode = '22023', message = 'Operator and organization IDs are required.';
  end if;

  if not exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_operator_user_id
      and platform_operator.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active platform operator is required.';
  end if;

  select organization.id, organization.slug, organization.state
  into v_organization
  from public.organizations as organization
  where organization.id = p_organization_id
    and organization.state = 'draft'
    and not organization.demo_mode
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'Only a non-demo draft organization can be deleted.';
  end if;

  if p_confirmation_slug is null
    or pg_catalog.btrim(p_confirmation_slug) <> v_organization.slug
  then
    raise exception using errcode = '22023', message = 'The confirmation slug does not match.';
  end if;

  if exists (select 1 from public.rooms where organization_id = p_organization_id)
    or exists (select 1 from public.beds where organization_id = p_organization_id)
    or exists (select 1 from public.tenant_profiles where organization_id = p_organization_id)
    or exists (select 1 from public.occupancies where organization_id = p_organization_id)
    or exists (select 1 from public.invoices where organization_id = p_organization_id)
    or exists (select 1 from public.payments where organization_id = p_organization_id)
    or exists (select 1 from public.owner_password_recoveries where organization_id = p_organization_id)
    or exists (
      select 1
      from storage.objects as storage_object
      where storage_object.name like 'organizations/' || p_organization_id::text || '/%'
    )
  then
    raise exception using errcode = 'P0001', message = 'This draft contains operational records and cannot be permanently deleted.';
  end if;

  select pg_catalog.count(*), pg_catalog.max(membership.auth_user_id::text)::uuid
  into v_membership_count, v_owner_auth_user_id
  from public.memberships as membership
  where membership.organization_id = p_organization_id;

  if v_membership_count > 1
    or exists (
      select 1
      from public.memberships as membership
      where membership.organization_id = p_organization_id
        and (membership.role <> 'owner' or membership.state <> 'active')
    )
  then
    raise exception using errcode = 'P0001', message = 'Only a blank draft with at most one active owner can be restarted.';
  end if;

  select pg_catalog.count(*)
  into v_invitation_count
  from public.staff_invitations as invitation
  where invitation.organization_id = p_organization_id;

  if v_invitation_count > 1
    or exists (
      select 1
      from public.staff_invitations as invitation
      where invitation.organization_id = p_organization_id
        and (
          invitation.role <> 'owner'
          or (invitation.auth_user_id is not null and invitation.auth_user_id <> v_owner_auth_user_id)
          or (
            invitation.state = 'accepted'
            and (
              v_owner_auth_user_id is null
              or invitation.credential_state <> 'activated'
              or invitation.activation_auth_user_id <> v_owner_auth_user_id
              or invitation.auth_user_id <> v_owner_auth_user_id
            )
          )
          or (
            invitation.activation_auth_user_id is not null
            and exists (
              select 1
              from auth.users as activation_user
              where activation_user.id = invitation.activation_auth_user_id
                and (
                  v_owner_auth_user_id is null
                  or activation_user.id <> v_owner_auth_user_id
                )
            )
          )
        )
    )
  then
    raise exception using errcode = 'P0001', message = 'The draft owner authority is not safe to remove automatically.';
  end if;

  if v_owner_auth_user_id is not null and (
    exists (
      select 1
      from public.platform_operators as platform_operator
      where platform_operator.auth_user_id = v_owner_auth_user_id
    )
    or exists (
      select 1
      from public.memberships as other_membership
      where other_membership.auth_user_id = v_owner_auth_user_id
        and other_membership.organization_id <> p_organization_id
    )
  ) then
    raise exception using errcode = 'P0001', message = 'A shared or platform-operator identity cannot be removed with a draft.';
  end if;

  insert into public.platform_audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data,
    created_at
  ) values (
    p_operator_user_id,
    'organization.empty_draft_deleted',
    'organization',
    p_organization_id::text,
    pg_catalog.jsonb_build_object(
      'slug', v_organization.slug,
      'previousState', v_organization.state,
      'emptyDraft', true,
      'ownerAuthRemoved', v_owner_auth_user_id is not null
    ),
    v_now
  );

  -- Delete organization-scoped rows that restrict removal of the Auth user or
  -- organization. The Auth deletion then cascades its single membership.
  delete from public.staff_invitations
  where organization_id = p_organization_id;

  delete from public.audit_events
  where organization_id = p_organization_id;

  if v_owner_auth_user_id is not null then
    delete from auth.users
    where id = v_owner_auth_user_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'The draft owner Auth identity was not removed.';
    end if;
  end if;

  -- provisioning_steps cascade from provisioning_jobs.
  delete from public.provisioning_jobs
  where organization_id = p_organization_id;

  delete from public.properties
  where organization_id = p_organization_id;

  delete from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'The draft organization was not deleted.';
  end if;

  return pg_catalog.jsonb_build_object(
    'deleted', true,
    'organizationId', p_organization_id,
    'slug', v_organization.slug,
    'ownerAuthRemoved', v_owner_auth_user_id is not null
  );
end;
$$;

revoke all on function public.delete_empty_draft_organization(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_empty_draft_organization(uuid, uuid, text)
  to service_role;

comment on function public.delete_empty_draft_organization(uuid, uuid, text) is
  'Permanently deletes a blank non-demo draft and, when present, its single unshared non-operator onboarding owner Auth identity in one transaction.';

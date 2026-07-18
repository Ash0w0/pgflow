-- Permanently remove only an empty, failed onboarding draft. Live or populated
-- PGs use the separate archive/export/offboarding lifecycle and can never pass
-- this function's guards.

create table public.platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.platform_operators(auth_user_id) on delete restrict,
  action text not null check (action ~ '^[a-z0-9_.]{3,80}$'),
  entity_type text not null check (entity_type ~ '^[a-z0-9_]{2,64}$'),
  entity_id text not null check (char_length(entity_id) between 1 and 128),
  after_data jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(after_data) = 'object'),
  created_at timestamptz not null default now()
);

create index platform_audit_events_actor_created_idx
  on public.platform_audit_events (actor_id, created_at desc);

alter table public.platform_audit_events enable row level security;
revoke all on public.platform_audit_events from public, anon, authenticated, service_role;
grant select on public.platform_audit_events to service_role;

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

  if exists (select 1 from public.memberships where organization_id = p_organization_id)
    or exists (select 1 from public.rooms where organization_id = p_organization_id)
    or exists (select 1 from public.beds where organization_id = p_organization_id)
    or exists (select 1 from public.tenant_profiles where organization_id = p_organization_id)
    or exists (select 1 from public.occupancies where organization_id = p_organization_id)
    or exists (select 1 from public.invoices where organization_id = p_organization_id)
    or exists (select 1 from public.payments where organization_id = p_organization_id)
    or exists (select 1 from public.owner_password_recoveries where organization_id = p_organization_id)
    or exists (
      select 1
      from public.staff_invitations as invitation
      where invitation.organization_id = p_organization_id
        and (
          invitation.state = 'accepted'
          or invitation.credential_state = 'activated'
          or invitation.auth_user_id is not null
          or exists (
            select 1
            from auth.users as auth_user
            where auth_user.id = invitation.activation_auth_user_id
          )
        )
    )
  then
    raise exception using errcode = 'P0001', message = 'This draft contains owner authority or operational records and cannot be permanently deleted.';
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
      'emptyDraft', true
    ),
    v_now
  );

  delete from public.staff_invitations
  where organization_id = p_organization_id;

  delete from public.audit_events
  where organization_id = p_organization_id;

  -- provisioning_steps cascade from provisioning_jobs.
  delete from public.provisioning_jobs
  where organization_id = p_organization_id;

  delete from public.properties
  where organization_id = p_organization_id;

  -- Brand themes, approved hostnames, and any other cascade-owned blank-shell
  -- configuration are removed with the organization.
  delete from public.organizations
  where id = p_organization_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'The draft organization was not deleted.';
  end if;

  return pg_catalog.jsonb_build_object(
    'deleted', true,
    'organizationId', p_organization_id,
    'slug', v_organization.slug
  );
end;
$$;

revoke all on function public.delete_empty_draft_organization(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_empty_draft_organization(uuid, uuid, text)
  to service_role;

comment on function public.delete_empty_draft_organization(uuid, uuid, text) is
  'Permanently deletes only a manually confirmed empty non-demo draft and preserves a platform-level audit event.';

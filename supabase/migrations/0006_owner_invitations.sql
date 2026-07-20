-- Safe staging for the first PG owner invitation.
--
-- This migration deliberately stops before Auth user or membership creation.
-- The application generates the raw bearer token, passes only its SHA-256
-- digest to this RPC, and delivers the raw token outside PostgreSQL.

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  role public.membership_role not null,
  display_name text not null,
  phone text not null,
  token_hash text not null unique,
  state text not null default 'pending'
    check (state in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete restrict,
  constraint staff_invitations_staff_role_check
    check (role in ('owner', 'manager', 'accountant')),
  constraint staff_invitations_display_name_check
    check (
      display_name = pg_catalog.btrim(display_name)
      and pg_catalog.char_length(display_name) between 2 and 120
      and display_name !~ '[[:cntrl:]]'
    ),
  constraint staff_invitations_indian_phone_check
    check (phone ~ '^\+91[6-9][0-9]{9}$'),
  constraint staff_invitations_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint staff_invitations_short_expiry_check
    check (
      expires_at >= created_at + interval '5 minutes'
      and expires_at <= created_at + interval '24 hours'
    ),
  constraint staff_invitations_state_consistency_check
    check (
      (
        state = 'pending'
        and accepted_by is null
        and accepted_at is null
        and revoked_by is null
        and revoked_at is null
        and expired_at is null
      )
      or (
        state = 'accepted'
        and accepted_by is not null
        and accepted_at is not null
        and revoked_by is null
        and revoked_at is null
        and expired_at is null
      )
      or (
        state = 'revoked'
        and accepted_by is null
        and accepted_at is null
        and revoked_by is not null
        and revoked_at is not null
        and expired_at is null
      )
      or (
        state = 'expired'
        and accepted_by is null
        and accepted_at is null
        and revoked_by is null
        and revoked_at is null
        and expired_at is not null
        and expired_at >= expires_at
      )
    )
);

create index staff_invitations_org_state_created_idx
  on public.staff_invitations (organization_id, state, created_at desc);

create unique index staff_invitations_one_pending_owner_per_org_uq
  on public.staff_invitations (organization_id)
  where role = 'owner' and state = 'pending';

alter table public.staff_invitations enable row level security;

-- There is intentionally no client RLS policy. Creation and replacement go
-- through the security-definer RPC; service_role receives read-only inspection
-- access for server-side status surfaces.
revoke all on public.staff_invitations from public, anon, authenticated, service_role;
grant select on public.staff_invitations to service_role;

create trigger staff_invitations_set_updated_at
before update on public.staff_invitations
for each row execute function public.set_updated_at();

create or replace function public.create_owner_invitation(
  p_operator_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_display_name text,
  p_phone text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_display_name text := pg_catalog.btrim(p_display_name);
  v_phone text := pg_catalog.btrim(p_phone);
  v_token_hash text := pg_catalog.btrim(p_token_hash);
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_invitation_id uuid;
  v_revoked_invitation_id uuid;
  v_persisted record;
begin
  if p_operator_user_id is null then
    raise exception using errcode = '22023', message = 'An operator user ID is required.';
  end if;

  if p_organization_id is null or p_property_id is null then
    raise exception using errcode = '22023', message = 'An organization and property are required.';
  end if;

  if v_display_name is null
    or pg_catalog.char_length(v_display_name) not between 2 and 120
    or v_display_name ~ '[[:cntrl:]]'
  then
    raise exception using errcode = '22023', message = 'A valid owner display name is required.';
  end if;

  if v_phone is null or v_phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception using errcode = '22023', message = 'A valid Indian E.164 mobile number is required.';
  end if;

  if v_token_hash is null or v_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'A lowercase SHA-256 invitation token hash is required.';
  end if;

  if p_expires_at is null
    or p_expires_at < v_now + interval '5 minutes'
    or p_expires_at > v_now + interval '24 hours'
  then
    raise exception using errcode = '22023', message = 'Invitation expiry must be between 5 minutes and 24 hours.';
  end if;

  if not exists (
    select 1
    from public.platform_operators as platform_operator
    where platform_operator.auth_user_id = p_operator_user_id
      and platform_operator.state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'An active platform operator is required.';
  end if;

  -- Locking the organization serializes replacements for the same PG. The
  -- partial unique index below remains the final invariant under concurrency.
  perform 1
  from public.organizations as organization
  where organization.id = p_organization_id
    and organization.state = 'draft'
    and not organization.demo_mode
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Owner invitations require a non-demo draft organization.';
  end if;

  if not exists (
    select 1
    from public.properties as property
    where property.id = p_property_id
      and property.organization_id = p_organization_id
  ) then
    raise exception using errcode = '22023', message = 'The property does not belong to the organization.';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.role = 'owner'
      and membership.state in ('invited', 'active')
  ) then
    raise exception using errcode = 'P0001', message = 'The organization already has an owner membership.';
  end if;

  update public.staff_invitations as invitation
  set
    state = 'revoked',
    revoked_by = p_operator_user_id,
    revoked_at = v_now
  where invitation.organization_id = p_organization_id
    and invitation.role = 'owner'
    and invitation.state = 'pending'
  returning invitation.id into v_revoked_invitation_id;

  insert into public.staff_invitations (
    organization_id,
    property_id,
    role,
    display_name,
    phone,
    token_hash,
    state,
    expires_at,
    created_by,
    created_at,
    updated_at
  )
  values (
    p_organization_id,
    p_property_id,
    'owner',
    v_display_name,
    v_phone,
    v_token_hash,
    'pending',
    p_expires_at,
    p_operator_user_id,
    v_now,
    v_now
  )
  returning id into v_invitation_id;

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
    'owner_invitation.created',
    'staff_invitation',
    v_invitation_id::text,
    pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'invitationId', v_invitation_id,
        'propertyId', p_property_id,
        'role', 'owner',
        'state', 'pending',
        'expiresAt', p_expires_at,
        'replacedInvitationId', v_revoked_invitation_id
      )
    )
  );

  select
    invitation.id,
    invitation.organization_id,
    invitation.property_id,
    invitation.state,
    invitation.display_name,
    invitation.phone,
    invitation.expires_at
  into strict v_persisted
  from public.staff_invitations as invitation
  where invitation.id = v_invitation_id;

  return pg_catalog.jsonb_build_object(
    'invitationId', v_persisted.id,
    'organizationId', v_persisted.organization_id,
    'propertyId', v_persisted.property_id,
    'state', v_persisted.state,
    'displayName', v_persisted.display_name,
    'phone', v_persisted.phone,
    'expiresAt', v_persisted.expires_at
  );
end;
$$;

revoke all on function public.create_owner_invitation(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.create_owner_invitation(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz
) to service_role;

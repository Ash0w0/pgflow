-- 15-day free trial -> paid plan lifecycle.
--
-- * Every organization starts with a 15-day trial with no resident cap.
-- * A platform operator marks a PG as paid until a date (audited).
-- * When neither the trial nor the paid period is current, the workspace is
--   read-only: existing records stay visible, pending payments can still be
--   reviewed and residents can still pay through links already sent, but no
--   new residents, rooms, rent, payment links or cash entries can be created.
--   This is enforced by triggers, so every current and future write path is
--   covered.

alter table public.organizations
  add column if not exists trial_ends_at timestamptz,
  add column if not exists paid_until timestamptz;

-- Existing organizations (pilot/test PGs) start a fresh 15-day trial now.
update public.organizations
set trial_ends_at = pg_catalog.now() + interval '15 days'
where trial_ends_at is null;

alter table public.organizations
  alter column trial_ends_at set default (pg_catalog.now() + interval '15 days'),
  alter column trial_ends_at set not null;

-- Trial and paid PGs have no resident cap; the old two-resident starter cap is retired.
alter table public.organizations alter column resident_limit set default 100000;
update public.organizations set resident_limit = 100000 where resident_limit < 100000;

comment on column public.organizations.trial_ends_at is
  'End of the free trial. The workspace is writable while now() < trial_ends_at or now() < paid_until.';
comment on column public.organizations.paid_until is
  'End of the paid period set by a platform operator; null when the PG has never paid.';

create or replace function public.organization_plan_status(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when organization.paid_until is not null and organization.paid_until > pg_catalog.now() then 'paid'
    when organization.trial_ends_at > pg_catalog.now() then 'trial'
    else 'expired'
  end
  from public.organizations as organization
  where organization.id = p_organization_id;
$$;

create or replace function public.enforce_organization_plan_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if tg_table_name = 'payments' then
    -- Residents may still pay through links that were already sent.
    if pg_catalog.to_jsonb(new) ->> 'method' <> 'cash' then
      return new;
    end if;
  end if;

  if tg_table_name = 'tenant_profiles' and tg_op = 'UPDATE' then
    if new.state not in ('active', 'notice') or old.state in ('active', 'notice') then
      return new;
    end if;
  end if;

  v_status := public.organization_plan_status(new.organization_id);
  if v_status is null then
    raise exception using errcode = '23503', message = 'The organization does not exist.';
  end if;

  if v_status = 'expired' then
    raise exception using
      errcode = 'P0001',
      message = 'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.';
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_profiles_enforce_plan on public.tenant_profiles;
create trigger tenant_profiles_enforce_plan
before insert or update of state on public.tenant_profiles
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists floors_enforce_plan on public.floors;
create trigger floors_enforce_plan
before insert on public.floors
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists rooms_enforce_plan on public.rooms;
create trigger rooms_enforce_plan
before insert on public.rooms
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists beds_enforce_plan on public.beds;
create trigger beds_enforce_plan
before insert on public.beds
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists invoices_enforce_plan on public.invoices;
create trigger invoices_enforce_plan
before insert on public.invoices
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists invoice_payment_requests_enforce_plan on public.invoice_payment_requests;
create trigger invoice_payment_requests_enforce_plan
before insert on public.invoice_payment_requests
for each row execute function public.enforce_organization_plan_write();

drop trigger if exists payments_enforce_plan on public.payments;
create trigger payments_enforce_plan
before insert on public.payments
for each row execute function public.enforce_organization_plan_write();

-- Operator plan changes: audited, compare-free, and bounded.
create or replace function public.set_organization_plan(
  p_operator_user_id uuid,
  p_organization_id uuid,
  p_action text,
  p_until timestamptz,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_before record;
  v_note text := pg_catalog.left(pg_catalog.btrim(coalesce(p_note, '')), 300);
  v_trial_ends_at timestamptz;
  v_paid_until timestamptz;
begin
  if not exists (
    select 1 from public.platform_operators
    where auth_user_id = p_operator_user_id and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Platform operator authorization is required.';
  end if;

  select organization.id, organization.trial_ends_at, organization.paid_until, organization.state
  into v_before
  from public.organizations as organization
  where organization.id = p_organization_id
  for update;

  if not found or v_before.state = 'archived' then
    raise exception using errcode = 'P0002', message = 'The PG was not found.';
  end if;

  v_trial_ends_at := v_before.trial_ends_at;
  v_paid_until := v_before.paid_until;

  if p_action = 'mark_paid' then
    if p_until is null or p_until <= v_now or p_until > v_now + interval '3 years' then
      raise exception using errcode = '22023', message = 'Choose a paid-until date in the next 3 years.';
    end if;
    v_paid_until := p_until;
  elsif p_action = 'extend_trial' then
    if p_until is null or p_until <= v_now or p_until > v_now + interval '90 days' then
      raise exception using errcode = '22023', message = 'Choose a trial end date in the next 90 days.';
    end if;
    v_trial_ends_at := p_until;
  elsif p_action = 'end_access' then
    v_trial_ends_at := least(v_trial_ends_at, v_now);
    v_paid_until := null;
  else
    raise exception using errcode = '22023', message = 'Unsupported plan action.';
  end if;

  update public.organizations
  set trial_ends_at = v_trial_ends_at,
      paid_until = v_paid_until,
      updated_at = v_now
  where id = p_organization_id;

  insert into public.platform_audit_events (actor_id, action, entity_type, entity_id, after_data)
  values (
    p_operator_user_id,
    'organization.plan_' || p_action,
    'organization',
    p_organization_id::text,
    pg_catalog.jsonb_build_object(
      'previousTrialEndsAt', v_before.trial_ends_at,
      'previousPaidUntil', v_before.paid_until,
      'trialEndsAt', v_trial_ends_at,
      'paidUntil', v_paid_until,
      'note', v_note
    )
  );

  return pg_catalog.jsonb_build_object(
    'organizationId', p_organization_id,
    'status', public.organization_plan_status(p_organization_id),
    'trialEndsAt', v_trial_ends_at,
    'paidUntil', v_paid_until
  );
end;
$$;

revoke all on function public.organization_plan_status(uuid) from public, anon, authenticated;
revoke all on function public.enforce_organization_plan_write() from public, anon, authenticated;
revoke all on function public.set_organization_plan(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.organization_plan_status(uuid) to service_role;
grant execute on function public.set_organization_plan(uuid, uuid, text, timestamptz, text) to service_role;

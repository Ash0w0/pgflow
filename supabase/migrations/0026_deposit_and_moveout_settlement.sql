-- Create table for resident move-out settlements and deposit reconciliation
create table if not exists public.resident_moveouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid not null references public.tenant_profiles(id) on delete cascade,
  bed_id uuid references public.beds(id) on delete set null,
  exit_date date not null,
  deposit_amount numeric(10, 2) not null check (deposit_amount >= 0),
  utility_deductions numeric(10, 2) not null default 0 check (utility_deductions >= 0),
  damage_deductions numeric(10, 2) not null default 0 check (damage_deductions >= 0),
  unpaid_rent_deductions numeric(10, 2) not null default 0 check (unpaid_rent_deductions >= 0),
  net_refund_amount numeric(10, 2) not null,
  settlement_status text not null default 'completed' check (settlement_status in ('pending', 'completed', 'refunded')),
  remarks text,
  settled_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index if not exists resident_moveouts_org_idx
  on public.resident_moveouts (organization_id, created_at desc);

create index if not exists resident_moveouts_resident_idx
  on public.resident_moveouts (resident_id);

alter table public.resident_moveouts enable row level security;
revoke all on public.resident_moveouts from public, anon, authenticated, service_role;
grant select on public.resident_moveouts to service_role;

-- Process resident moveout RPC function
create or replace function public.process_resident_moveout(
  p_actor_id uuid,
  p_organization_id uuid,
  p_resident_id uuid,
  p_exit_date date,
  p_utility_deductions numeric default 0,
  p_damage_deductions numeric default 0,
  p_unpaid_rent_deductions numeric default 0,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_resident record;
  v_occupancy record;
  v_bed_id uuid;
  v_deposit numeric(10, 2);
  v_utility numeric(10, 2) := pg_catalog.coalesce(p_utility_deductions, 0);
  v_damage numeric(10, 2) := pg_catalog.coalesce(p_damage_deductions, 0);
  v_unpaid_rent numeric(10, 2) := pg_catalog.coalesce(p_unpaid_rent_deductions, 0);
  v_net_refund numeric(10, 2);
  v_moveout_id uuid;
begin
  if p_actor_id is null
    or p_organization_id is null
    or p_resident_id is null
    or p_exit_date is null
    or v_utility < 0
    or v_damage < 0
    or v_unpaid_rent < 0
  then
    raise exception using errcode = '22023', message = 'Invalid resident move-out parameters.';
  end if;

  -- Verify active membership for actor
  perform 1
  from public.memberships as membership
  where membership.organization_id = p_organization_id
    and membership.auth_user_id = p_actor_id
    and membership.role in ('owner', 'manager')
    and membership.state = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Owner or manager authorization is required for move-out settlement.';
  end if;

  -- Lock resident for moveout
  select
    resident.id,
    resident.organization_id,
    resident.state,
    resident.full_name
  into strict v_resident
  from public.tenant_profiles as resident
  where resident.id = p_resident_id
    and resident.organization_id = p_organization_id
  for update;

  if v_resident.state not in ('active', 'notice') then
    raise exception using errcode = '22023', message = 'Resident is not eligible for move-out.';
  end if;

  -- Bed assignment and deposit live on the active occupancy, not tenant_profiles.
  begin
    select
      occupancy.id,
      occupancy.bed_id,
      occupancy.move_in_date,
      occupancy.deposit_promised
    into strict v_occupancy
    from public.occupancies as occupancy
    where occupancy.organization_id = p_organization_id
      and occupancy.tenant_id = p_resident_id
      and occupancy.state in ('active', 'notice')
    for update;
  exception
    when no_data_found then
      raise exception using errcode = '22023', message = 'Resident has no active occupancy.';
    when too_many_rows then
      raise exception using errcode = '23000', message = 'Resident has multiple active occupancies.';
  end;

  if p_exit_date < v_occupancy.move_in_date then
    raise exception using errcode = '22023', message = 'Exit date cannot be before move-in date.';
  end if;

  v_bed_id := v_occupancy.bed_id;
  v_deposit := pg_catalog.coalesce(v_occupancy.deposit_promised, 0);
  v_net_refund := v_deposit - (v_utility + v_damage + v_unpaid_rent);

  -- Record moveout settlement
  insert into public.resident_moveouts (
    organization_id,
    resident_id,
    bed_id,
    exit_date,
    deposit_amount,
    utility_deductions,
    damage_deductions,
    unpaid_rent_deductions,
    net_refund_amount,
    settlement_status,
    remarks,
    settled_by,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_resident_id,
    v_bed_id,
    p_exit_date,
    v_deposit,
    v_utility,
    v_damage,
    v_unpaid_rent,
    v_net_refund,
    'completed',
    p_remarks,
    p_actor_id,
    v_now,
    v_now
  ) returning id into v_moveout_id;

  -- Close the occupancy that owns the bed assignment and deposit.
  update public.occupancies as occupancy
  set state = 'completed',
      move_out_date = p_exit_date,
      updated_at = v_now
  where occupancy.id = v_occupancy.id
    and occupancy.organization_id = p_organization_id;

  update public.tenant_profiles as resident
  set state = 'moved_out',
      updated_at = v_now
  where resident.id = p_resident_id
    and resident.organization_id = p_organization_id;

  -- Free bed back to vacant
  if v_bed_id is not null then
    update public.beds as bed
    set state = 'vacant',
        updated_at = v_now
    where bed.id = v_bed_id
      and bed.organization_id = p_organization_id;
  end if;

  -- Audit event
  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    p_actor_id,
    'resident.moveout_completed',
    'resident_moveout',
    v_moveout_id::text,
    pg_catalog.jsonb_build_object(
      'residentId', p_resident_id,
      'residentName', v_resident.full_name,
      'occupancyId', v_occupancy.id,
      'exitDate', p_exit_date,
      'depositAmount', v_deposit,
      'utilityDeductions', v_utility,
      'damageDeductions', v_damage,
      'unpaidRentDeductions', v_unpaid_rent,
      'netRefundAmount', v_net_refund,
      'freedBedId', v_bed_id
    )
  );

  return pg_catalog.jsonb_build_object(
    'moveoutId', v_moveout_id,
    'organizationId', p_organization_id,
    'residentId', p_resident_id,
    'occupancyId', v_occupancy.id,
    'exitDate', p_exit_date,
    'depositAmount', v_deposit,
    'netRefundAmount', v_net_refund,
    'freedBedId', v_bed_id,
    'state', 'completed'
  );
end;
$function$;

revoke all on function public.process_resident_moveout(uuid, uuid, uuid, date, numeric, numeric, numeric, text)
  from public, anon, authenticated, service_role;
grant execute on function public.process_resident_moveout(uuid, uuid, uuid, date, numeric, numeric, numeric, text)
  to service_role;

comment on table public.resident_moveouts is
  'Audited resident departure settlements and security deposit deductions.';


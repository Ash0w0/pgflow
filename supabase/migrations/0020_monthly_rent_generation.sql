create table public.billing_cycles (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  due_date date not null,
  state text not null default 'issued' check (state in ('draft', 'issued', 'closed')),
  invoice_count integer not null default 0 check (invoice_count >= 0),
  total_amount bigint not null default 0 check (total_amount >= 0),
  generated_by uuid not null references auth.users(id),
  generated_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, property_id, period),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict
);

create index billing_cycles_org_period_idx
  on public.billing_cycles(organization_id, property_id, period desc);

alter table public.billing_cycles enable row level security;

create policy billing_cycles_staff_select on public.billing_cycles for select to authenticated
using (public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[]));

create or replace function public.generate_monthly_rent_invoices(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_period text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.properties;
  v_period_start date;
  v_period_end date;
  v_due_date date;
  v_occupancy record;
  v_invoice_id uuid;
  v_generated_count integer := 0;
  v_skipped_count integer := 0;
  v_generated_total bigint := 0;
  v_cycle_count integer := 0;
  v_cycle_total bigint := 0;
begin
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = '22023', message = 'Billing period must use YYYY-MM.';
  end if;

  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active property-owner access is required.';
  end if;

  select * into v_property
  from public.properties
  where id = p_property_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The property could not be found.';
  end if;

  v_period_start := pg_catalog.to_date(p_period || '-01', 'YYYY-MM-DD');
  if pg_catalog.to_char(v_period_start, 'YYYY-MM') <> p_period then
    raise exception using errcode = '22023', message = 'Billing period is invalid.';
  end if;
  if v_period_start <> pg_catalog.date_trunc('month', current_date)::date then
    raise exception using errcode = '22023', message = 'The first release can generate only the current month.';
  end if;
  v_period_end := (v_period_start + interval '1 month - 1 day')::date;
  v_due_date := pg_catalog.make_date(
    pg_catalog.date_part('year', v_period_start)::integer,
    pg_catalog.date_part('month', v_period_start)::integer,
    v_property.rent_due_day
  );

  for v_occupancy in
    select occupancy.id, occupancy.tenant_id, occupancy.move_in_date, occupancy.monthly_rent
    from public.occupancies as occupancy
    join public.tenant_profiles as tenant
      on tenant.organization_id = occupancy.organization_id
     and tenant.property_id = occupancy.property_id
     and tenant.id = occupancy.tenant_id
    where occupancy.organization_id = p_organization_id
      and occupancy.property_id = p_property_id
      and occupancy.state in ('active', 'notice')
      and tenant.state in ('active', 'notice')
      and occupancy.move_in_date <= v_period_end
    order by occupancy.tenant_id
    for update of occupancy
  loop
    if exists (
      select 1 from public.invoices
      where organization_id = p_organization_id
        and tenant_id = v_occupancy.tenant_id
        and period = p_period
    ) then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    v_invoice_id := extensions.gen_random_uuid();
    insert into public.invoices (
      id, organization_id, property_id, tenant_id, period, number,
      due_date, total_amount, paid_amount, state
    ) values (
      v_invoice_id, p_organization_id, p_property_id, v_occupancy.tenant_id, p_period,
      'INV-' || pg_catalog.replace(p_period, '-', '') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_invoice_id::text, '-', ''), 1, 8)),
      greatest(v_due_date, v_occupancy.move_in_date),
      v_occupancy.monthly_rent, 0,
      case when greatest(v_due_date, v_occupancy.move_in_date) < current_date then 'overdue' else 'issued' end
    );

    insert into public.invoice_line_items (
      organization_id, invoice_id, kind, description, amount, metadata
    ) values (
      p_organization_id, v_invoice_id, 'rent',
      'Monthly rent for ' || pg_catalog.to_char(v_period_start, 'FMMonth YYYY'),
      v_occupancy.monthly_rent,
      pg_catalog.jsonb_build_object('source', 'monthly_generation', 'occupancyId', v_occupancy.id)
    );

    v_generated_count := v_generated_count + 1;
    v_generated_total := v_generated_total + v_occupancy.monthly_rent;
  end loop;

  select pg_catalog.count(*)::integer, coalesce(pg_catalog.sum(total_amount), 0)::bigint
  into v_cycle_count, v_cycle_total
  from public.invoices
  where organization_id = p_organization_id
    and property_id = p_property_id
    and period = p_period;

  insert into public.billing_cycles (
    organization_id, property_id, period, due_date, state,
    invoice_count, total_amount, generated_by, generated_at
  ) values (
    p_organization_id, p_property_id, p_period, v_due_date, 'issued',
    v_cycle_count, v_cycle_total, p_actor_user_id, pg_catalog.now()
  )
  on conflict (organization_id, property_id, period) do update
  set due_date = excluded.due_date,
      state = 'issued',
      invoice_count = excluded.invoice_count,
      total_amount = excluded.total_amount,
      generated_by = excluded.generated_by,
      generated_at = excluded.generated_at,
      updated_at = pg_catalog.now();

  if v_generated_count > 0 then
    insert into public.audit_events (
      organization_id, actor_id, action, entity_type, entity_id, after_data
    ) values (
      p_organization_id, p_actor_user_id, 'billing.monthly_generated', 'billing_cycle',
      p_property_id::text || ':' || p_period,
      pg_catalog.jsonb_build_object(
        'propertyId', p_property_id,
        'period', p_period,
        'dueDate', v_due_date,
        'generatedCount', v_generated_count,
        'skippedCount', v_skipped_count,
        'generatedTotal', v_generated_total
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'period', p_period,
    'dueDate', v_due_date,
    'generatedCount', v_generated_count,
    'skippedCount', v_skipped_count,
    'generatedTotal', v_generated_total,
    'invoiceCount', v_cycle_count,
    'invoiceTotal', v_cycle_total
  );
end;
$$;

revoke all on function public.generate_monthly_rent_invoices(uuid, uuid, uuid, text) from public;
grant execute on function public.generate_monthly_rent_invoices(uuid, uuid, uuid, text) to service_role;

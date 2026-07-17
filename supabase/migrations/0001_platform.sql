-- Production PostgreSQL/Supabase foundation for PGFlow.
-- The deployable Sites demo uses D1/R2 bindings; this migration is the
-- production source of truth for app-owned phone/password auth and RLS.

create extension if not exists pgcrypto;

create type public.membership_role as enum ('platform_operator', 'owner', 'manager', 'accountant', 'tenant');
create type public.organization_state as enum ('draft', 'core_ready', 'integrations_pending', 'live', 'suspended', 'archived');
create type public.payment_method as enum ('upi', 'cash');
create type public.payment_state as enum ('pending_review', 'approved', 'rejected', 'reversed', 'refunded');

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null check (status in ('draft', 'current', 'retired')) default 'draft',
  contract jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$'),
  template_version_id uuid not null references public.template_versions(id),
  state public.organization_state not null default 'draft',
  demo_mode boolean not null default false,
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  retention_days integer not null default 365 check (retention_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  address text not null default '',
  support_phone text not null default '',
  rent_due_day integer not null default 5 check (rent_due_day between 1 and 28),
  electricity_mode text not null default 'manual' check (electricity_mode in ('disabled', 'flat', 'manual', 'tenant_meter', 'shared_room_meter')),
  electricity_rate numeric(12,2) not null default 0 check (electricity_rate >= 0),
  notice_days integer not null default 30 check (notice_days >= 0),
  upi_id text not null default '',
  upi_payee_name text not null default '',
  require_cash_approval boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index properties_org_idx on public.properties(organization_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  display_name text not null,
  role public.membership_role not null,
  state text not null default 'invited' check (state in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, auth_user_id),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete cascade
);
create index memberships_user_state_idx on public.memberships(auth_user_id, state);
create index memberships_org_role_idx on public.memberships(organization_id, role);

create table public.brand_themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  logo_key text,
  primary_color text not null default '#123d32',
  accent_color text not null default '#d7ff86',
  app_name text not null,
  short_name text not null,
  powered_by_enabled boolean not null default true,
  tokens jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.domain_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hostname text not null unique,
  kind text not null check (kind in ('platform_subdomain', 'custom')),
  state text not null default 'pending' check (state in ('pending', 'verified', 'failed')),
  verification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  floor_name text not null,
  code text not null,
  capacity integer not null check (capacity > 0),
  default_rent bigint not null check (default_rent >= 0),
  state text not null default 'active' check (state in ('active', 'maintenance', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, property_id, code),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict
);
create index rooms_org_property_idx on public.rooms(organization_id, property_id);

create table public.beds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  room_id uuid not null,
  label text not null,
  rent_override bigint check (rent_override is null or rent_override >= 0),
  state text not null default 'vacant' check (state in ('vacant', 'reserved', 'occupied', 'notice_period', 'maintenance', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, room_id, label),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, room_id) references public.rooms(organization_id, id) on delete restrict
);
create index beds_org_state_idx on public.beds(organization_id, state);

create table public.tenant_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  membership_id uuid,
  full_name text not null,
  phone text not null,
  alternate_phone text,
  emergency_name text not null default '',
  emergency_phone text not null default '',
  address text not null default '',
  government_id_type text,
  government_id_masked text,
  state text not null default 'active' check (state in ('active', 'notice', 'moved_out', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, membership_id) references public.memberships(organization_id, id) on delete set null (membership_id)
);
create index tenant_profiles_org_state_idx on public.tenant_profiles(organization_id, state);

create table public.occupancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  tenant_id uuid not null,
  bed_id uuid not null,
  move_in_date date not null,
  move_out_date date,
  monthly_rent bigint not null check (monthly_rent >= 0),
  deposit_promised bigint not null default 0 check (deposit_promised >= 0),
  state text not null default 'active' check (state in ('active', 'notice', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, bed_id) references public.beds(organization_id, id) on delete restrict
);
create unique index occupancies_active_bed_uq on public.occupancies(organization_id, bed_id) where state in ('active', 'notice');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  tenant_id uuid not null,
  period text not null,
  number text not null,
  due_date date not null,
  total_amount bigint not null check (total_amount >= 0),
  paid_amount bigint not null default 0 check (paid_amount >= 0),
  state text not null default 'draft' check (state in ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, tenant_id, period),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete restrict,
  check (paid_amount <= total_amount)
);
create index invoices_org_state_idx on public.invoices(organization_id, state);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null,
  kind text not null check (kind in ('rent', 'electricity', 'adjustment', 'credit')),
  description text not null,
  amount bigint not null,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (organization_id, invoice_id) references public.invoices(organization_id, id) on delete restrict
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  tenant_id uuid not null,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  reference text,
  state public.payment_state not null default 'pending_review',
  paid_at timestamptz not null,
  submitted_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete restrict
);
create unique index payments_org_reference_uq on public.payments(organization_id, reference) where reference is not null;
create index payments_org_state_idx on public.payments(organization_id, state);

create table public.payment_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  object_key text not null,
  content_type text not null,
  file_hash text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, file_hash),
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events(organization_id, created_at desc);

create or replace function public.current_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.memberships
  where auth_user_id = auth.uid() and state = 'active';
$$;

create or replace function public.has_org_role(target_org uuid, allowed_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where auth_user_id = auth.uid()
      and organization_id = target_org
      and state = 'active'
      and role = any(allowed_roles)
  );
$$;

create or replace function public.is_own_tenant(target_org uuid, target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_profiles tenant
    join public.memberships membership
      on membership.id = tenant.membership_id
     and membership.organization_id = tenant.organization_id
    where tenant.id = target_tenant
      and tenant.organization_id = target_org
      and membership.auth_user_id = auth.uid()
      and membership.state = 'active'
      and membership.role = 'tenant'
  );
$$;

revoke all on function public.current_organization_ids() from public;
revoke all on function public.has_org_role(uuid, public.membership_role[]) from public;
revoke all on function public.is_own_tenant(uuid, uuid) from public;
grant execute on function public.current_organization_ids() to authenticated;
grant execute on function public.has_org_role(uuid, public.membership_role[]) to authenticated;
grant execute on function public.is_own_tenant(uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.memberships enable row level security;
alter table public.brand_themes enable row level security;
alter table public.domain_mappings enable row level security;
alter table public.rooms enable row level security;
alter table public.beds enable row level security;
alter table public.tenant_profiles enable row level security;
alter table public.occupancies enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_evidence enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_member_select on public.organizations for select to authenticated
using (id in (select public.current_organization_ids()));

create policy memberships_scoped_select on public.memberships for select to authenticated
using (
  auth_user_id = auth.uid()
  or public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
);

create policy memberships_owner_write on public.memberships for all to authenticated
using (public.has_org_role(organization_id, array['owner']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.membership_role[]));

create policy properties_member_select on public.properties for select to authenticated
using (organization_id in (select public.current_organization_ids()));
create policy properties_owner_write on public.properties for all to authenticated
using (public.has_org_role(organization_id, array['owner']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.membership_role[]));

create policy brand_themes_org_access on public.brand_themes for select to authenticated
using (organization_id in (select public.current_organization_ids()));
create policy brand_themes_owner_write on public.brand_themes for all to authenticated
using (public.has_org_role(organization_id, array['owner']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner']::public.membership_role[]));

create policy domain_mappings_owner_access on public.domain_mappings for select to authenticated
using (public.has_org_role(organization_id, array['owner']::public.membership_role[]));

create policy rooms_member_select on public.rooms for select to authenticated
using (organization_id in (select public.current_organization_ids()));
create policy rooms_operations_write on public.rooms for all to authenticated
using (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]));
create policy beds_member_select on public.beds for select to authenticated
using (organization_id in (select public.current_organization_ids()));
create policy beds_operations_write on public.beds for all to authenticated
using (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]));

create policy tenant_profiles_staff_select on public.tenant_profiles for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or membership_id in (select id from public.memberships where auth_user_id = auth.uid())
);
create policy tenant_profiles_staff_write on public.tenant_profiles for all to authenticated
using (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]));

create policy occupancies_scoped_select on public.occupancies for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or public.is_own_tenant(organization_id, tenant_id)
);
create policy occupancies_manager_write on public.occupancies for all to authenticated
using (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]))
with check (public.has_org_role(organization_id, array['owner','manager']::public.membership_role[]));

create policy invoices_scoped_select on public.invoices for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or public.is_own_tenant(organization_id, tenant_id)
);

create policy invoice_items_scoped_select on public.invoice_line_items for select to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_id
      and invoice.organization_id = organization_id
      and (
        public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
        or public.is_own_tenant(organization_id, invoice.tenant_id)
      )
  )
);

create policy payments_scoped_select on public.payments for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or public.is_own_tenant(organization_id, tenant_id)
);
create policy payments_submit on public.payments for insert to authenticated
with check (
  organization_id in (select public.current_organization_ids())
  and submitted_by = auth.uid()
  and state = 'pending_review'
  and approved_by is null
  and approved_at is null
  and (
    public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
    or public.is_own_tenant(organization_id, tenant_id)
  )
);

create policy evidence_scoped_select on public.payment_evidence for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','accountant']::public.membership_role[])
  or exists (
    select 1 from public.payments payment
    where payment.id = payment_id
      and payment.organization_id = organization_id
      and public.is_own_tenant(organization_id, payment.tenant_id)
  )
);
create policy evidence_org_insert on public.payment_evidence for insert to authenticated
with check (
  organization_id in (select public.current_organization_ids())
  and object_key like 'organizations/' || organization_id::text || '/%'
  and exists (
    select 1 from public.payments payment
    where payment.id = payment_id
      and payment.organization_id = organization_id
      and (
        payment.submitted_by = auth.uid()
        or public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
      )
  )
);

create policy audit_owner_accountant_select on public.audit_events for select to authenticated
using (public.has_org_role(organization_id, array['owner','accountant']::public.membership_role[]));

-- invoices, invoice_line_items, payment approvals/rejections/reversals, and
-- audit_events intentionally have no client mutation policy. Trusted server
-- transactions validate state transitions, allocations, receipts, and audit
-- records atomically with a service role.

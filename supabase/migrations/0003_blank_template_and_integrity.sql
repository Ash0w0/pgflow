-- Canonical blank-template bootstrap and integrity hardening.
-- This migration deliberately creates no organization, property, room, tenant,
-- invoice, payment, or other synthetic business record.

insert into public.template_versions (id, version, status, contract)
values (
  '00000000-0000-4000-8000-000000000100',
  '1.0.0',
  'current',
  $blank_template$
  {
    "id": "pgflow-blank",
    "version": "1.0.0",
    "businessData": false,
    "roles": ["platform_operator", "owner", "manager", "accountant", "tenant"],
    "languages": ["en-IN", "hi-IN"],
    "paymentMethods": ["upi", "cash"],
    "invoiceStates": ["draft", "issued", "partially_paid", "paid", "overdue", "void"],
    "paymentStates": ["pending_review", "approved", "rejected", "reversed", "refunded"],
    "brandingSlots": ["name", "short_name", "logo", "primary", "accent", "app_icon", "receipt_identity"],
    "defaultQuietHours": {"start": "20:00", "end": "09:00", "timezone": "Asia/Kolkata"},
    "demoRecords": 0
  }
  $blank_template$::jsonb
)
on conflict (version) do update
set status = excluded.status,
    contract = excluded.contract;

-- Provisioning must never have to guess between multiple current contracts.
create unique index template_versions_one_current_uq
  on public.template_versions ((status))
  where status = 'current';

-- A tenant profile is visible to its resident only through an active tenant
-- membership. The former policy also admitted invited and disabled members.
drop policy if exists tenant_profiles_staff_select on public.tenant_profiles;
create policy tenant_profiles_staff_select on public.tenant_profiles
for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','manager','accountant']::public.membership_role[]
  )
  or public.is_own_tenant(organization_id, id)
);

-- Authenticated table mutation grants were removed in 0002. Remove the dormant
-- write policies as well so a later grant cannot silently reopen direct writes.
drop policy if exists memberships_owner_write on public.memberships;
drop policy if exists properties_owner_write on public.properties;
drop policy if exists brand_themes_owner_write on public.brand_themes;
drop policy if exists rooms_operations_write on public.rooms;
drop policy if exists beds_operations_write on public.beds;
drop policy if exists tenant_profiles_staff_write on public.tenant_profiles;
drop policy if exists occupancies_manager_write on public.occupancies;

-- Composite keys let child records prove that their referenced parent belongs
-- to both the same organization and the same property.
alter table public.memberships
  add constraint memberships_org_property_id_uq
  unique (organization_id, property_id, id);

alter table public.rooms
  add constraint rooms_org_property_id_uq
  unique (organization_id, property_id, id);

alter table public.beds
  add constraint beds_org_property_id_uq
  unique (organization_id, property_id, id);

alter table public.tenant_profiles
  add constraint tenant_profiles_org_property_id_uq
  unique (organization_id, property_id, id);

alter table public.beds
  add constraint beds_room_property_fkey
  foreign key (organization_id, property_id, room_id)
  references public.rooms (organization_id, property_id, id)
  on delete restrict;

alter table public.tenant_profiles
  add constraint tenant_profiles_membership_property_fkey
  foreign key (organization_id, property_id, membership_id)
  references public.memberships (organization_id, property_id, id)
  on delete set null (membership_id);

alter table public.occupancies
  add constraint occupancies_tenant_property_fkey
  foreign key (organization_id, property_id, tenant_id)
  references public.tenant_profiles (organization_id, property_id, id)
  on delete restrict,
  add constraint occupancies_bed_property_fkey
  foreign key (organization_id, property_id, bed_id)
  references public.beds (organization_id, property_id, id)
  on delete restrict,
  add constraint occupancies_dates_check
  check (move_out_date is null or move_out_date >= move_in_date);

alter table public.invoices
  add constraint invoices_tenant_property_fkey
  foreign key (organization_id, property_id, tenant_id)
  references public.tenant_profiles (organization_id, property_id, id)
  on delete restrict;

alter table public.payments
  add constraint payments_tenant_property_fkey
  foreign key (organization_id, property_id, tenant_id)
  references public.tenant_profiles (organization_id, property_id, id)
  on delete restrict;

create unique index occupancies_one_live_tenant_uq
  on public.occupancies (organization_id, tenant_id)
  where state in ('active', 'notice');

-- requireActor() expects one tenant profile for a membership.
create unique index tenant_profiles_membership_uq
  on public.tenant_profiles (organization_id, membership_id)
  where membership_id is not null;

-- Database evidence rows must use the same exact namespace as Storage objects.
drop policy if exists evidence_org_insert on public.payment_evidence;
create policy evidence_org_insert on public.payment_evidence
for insert to authenticated
with check (
  payment_evidence.organization_id in (select public.current_organization_ids())
  and split_part(payment_evidence.object_key, '/', 1) = 'organizations'
  and split_part(payment_evidence.object_key, '/', 2) = payment_evidence.organization_id::text
  and split_part(payment_evidence.object_key, '/', 3) = 'payment-evidence'
  and split_part(payment_evidence.object_key, '/', 4) <> ''
  and split_part(payment_evidence.object_key, '/', 5) = ''
  and exists (
    select 1
    from public.payments payment
    where payment.id = payment_evidence.payment_id
      and payment.organization_id = payment_evidence.organization_id
      and (
        payment.submitted_by = auth.uid()
        or public.has_org_role(
          payment_evidence.organization_id,
          array['owner','manager','accountant']::public.membership_role[]
        )
      )
  )
);

-- Restrict payment evidence to the route's exact four-segment object layout.
drop policy if exists payment_evidence_insert on storage.objects;
create policy payment_evidence_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payment-evidence'
  and public.has_storage_org_membership(name)
  and (storage.foldername(name))[3] = 'payment-evidence'
  and name ~ '^organizations/[^/]+/payment-evidence/[^/]+$'
);

drop policy if exists payment_evidence_select on storage.objects;
create policy payment_evidence_select on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-evidence'
  and (storage.foldername(name))[3] = 'payment-evidence'
  and name ~ '^organizations/[^/]+/payment-evidence/[^/]+$'
  and public.has_storage_org_membership(name)
  and (
    owner_id = auth.uid()::text
    or public.has_storage_org_membership(
      name,
      array['owner','accountant']::public.membership_role[]
    )
  )
);

-- These buckets have no owning database records or production routes yet.
-- Keep them private and inaccessible until record-bound policies are added.
drop policy if exists tenant_documents_insert on storage.objects;
drop policy if exists tenant_documents_select on storage.objects;
drop policy if exists complaint_media_insert on storage.objects;
drop policy if exists complaint_media_select on storage.objects;

-- updated_at is a database invariant, including for service-role transactions.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function public.set_updated_at();

create trigger brand_themes_set_updated_at
before update on public.brand_themes
for each row execute function public.set_updated_at();

create trigger domain_mappings_set_updated_at
before update on public.domain_mappings
for each row execute function public.set_updated_at();

create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

create trigger beds_set_updated_at
before update on public.beds
for each row execute function public.set_updated_at();

create trigger tenant_profiles_set_updated_at
before update on public.tenant_profiles
for each row execute function public.set_updated_at();

create trigger occupancies_set_updated_at
before update on public.occupancies
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger platform_operators_set_updated_at
before update on public.platform_operators
for each row execute function public.set_updated_at();

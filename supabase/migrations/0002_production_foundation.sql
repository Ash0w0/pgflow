-- Production tenancy, operator, grant, and private-storage hardening.
-- Apply after 0001_platform.sql through the Supabase migration workflow.

create table public.platform_operators (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  state text not null default 'active' check (state in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_operators enable row level security;
-- Intentionally no client policy. Operator checks are server-side, use a
-- verified Supabase user, and read this table with the server-only service role.

alter table public.domain_mappings
  add constraint domain_mappings_normalized_hostname_check
  check (
    hostname = lower(btrim(hostname))
    and length(hostname) between 1 and 253
    and position(':' in hostname) = 0
    and position('/' in hostname) = 0
    and position(' ' in hostname) = 0
  );

-- Supabase projects grant broad schema privileges by default. RLS remains the
-- row boundary, but these explicit grants keep anonymous users out and limit
-- authenticated clients to the operations that have policies in 0001.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on public.platform_operators from authenticated, anon, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to authenticated;
grant select on
  public.template_versions,
  public.organizations,
  public.properties,
  public.memberships,
  public.brand_themes,
  public.domain_mappings,
  public.rooms,
  public.beds,
  public.tenant_profiles,
  public.occupancies,
  public.invoices,
  public.invoice_line_items,
  public.payments,
  public.payment_evidence,
  public.audit_events
to authenticated;

-- Operational and configuration writes go through audited server transactions.
-- Direct authenticated clients can only submit pending payments/evidence.
grant insert on public.payments, public.payment_evidence to authenticated;

-- Private object storage is a separate security boundary from database rows.
-- Every object key starts with organizations/{organization_id}/... . No client
-- receives update/delete access; corrections happen through audited server code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-evidence', 'payment-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('tenant-documents', 'tenant-documents', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('complaint-media', 'complaint-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.has_storage_org_membership(object_name text, allowed_roles public.membership_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select
    (storage.foldername(object_name))[1] = 'organizations'
    and exists (
      select 1
      from public.memberships membership
      where membership.auth_user_id = auth.uid()
        and membership.state = 'active'
        and membership.organization_id::text = (storage.foldername(object_name))[2]
        and (allowed_roles is null or membership.role = any(allowed_roles))
    );
$$;

revoke all on function public.has_storage_org_membership(text, public.membership_role[]) from public;
grant execute on function public.has_storage_org_membership(text, public.membership_role[]) to authenticated;

drop policy if exists payment_evidence_insert on storage.objects;
create policy payment_evidence_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payment-evidence'
  and public.has_storage_org_membership(name)
);

drop policy if exists payment_evidence_select on storage.objects;
create policy payment_evidence_select on storage.objects
for select to authenticated
using (
  bucket_id = 'payment-evidence'
  and (
    owner_id = auth.uid()::text
    or public.has_storage_org_membership(name, array['owner','accountant']::public.membership_role[])
  )
);

drop policy if exists tenant_documents_insert on storage.objects;
create policy tenant_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'tenant-documents'
  and public.has_storage_org_membership(name, array['owner','manager','tenant']::public.membership_role[])
);

drop policy if exists tenant_documents_select on storage.objects;
create policy tenant_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'tenant-documents'
  and (
    owner_id = auth.uid()::text
    or public.has_storage_org_membership(name, array['owner','manager']::public.membership_role[])
  )
);

drop policy if exists complaint_media_insert on storage.objects;
create policy complaint_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'complaint-media'
  and public.has_storage_org_membership(name, array['owner','manager','tenant']::public.membership_role[])
);

drop policy if exists complaint_media_select on storage.objects;
create policy complaint_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'complaint-media'
  and (
    owner_id = auth.uid()::text
    or public.has_storage_org_membership(name, array['owner','manager']::public.membership_role[])
  )
);

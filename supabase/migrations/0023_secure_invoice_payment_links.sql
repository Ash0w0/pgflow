create table public.invoice_payment_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  invoice_id uuid not null,
  tenant_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'active' check (state in ('active', 'submitted', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  last_opened_at timestamptz,
  open_count integer not null default 0 check (open_count >= 0),
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, invoice_id)
    references public.invoices(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id)
    references public.tenant_profiles(organization_id, id) on delete restrict
);

create index invoice_payment_requests_org_invoice_idx
  on public.invoice_payment_requests(organization_id, invoice_id, state);
create index invoice_payment_requests_expiry_idx
  on public.invoice_payment_requests(expires_at)
  where state = 'active';

alter table public.invoice_payment_requests enable row level security;

create policy invoice_payment_requests_staff_select
on public.invoice_payment_requests for select to authenticated
using (
  public.has_org_role(
    organization_id,
    array['owner','manager','accountant']::public.membership_role[]
  )
);

alter table public.payments
  alter column submitted_by drop not null,
  add column if not exists payment_request_id uuid,
  add column if not exists submission_channel text not null default 'account'
    check (submission_channel in ('account', 'public_payment_link')),
  add constraint payments_public_submission_identity_check check (
    (submission_channel = 'account' and submitted_by is not null and payment_request_id is null)
    or
    (submission_channel = 'public_payment_link' and submitted_by is null and payment_request_id is not null)
  ),
  add constraint payments_payment_request_fkey
    foreign key (organization_id, payment_request_id)
    references public.invoice_payment_requests(organization_id, id) on delete restrict;

alter table public.audit_events
  alter column actor_id drop not null,
  add column if not exists actor_kind text not null default 'user'
    check (actor_kind in ('user', 'public_payment_link', 'system')),
  add constraint audit_events_actor_identity_check check (
    (actor_kind = 'user' and actor_id is not null)
    or
    (actor_kind <> 'user' and actor_id is null)
  );

create or replace function public.create_invoice_payment_request(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_invoice_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_request_id uuid := extensions.gen_random_uuid();
begin
  if not exists (
    select 1
    from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role in ('owner', 'manager', 'accountant')
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active staff access is required.';
  end if;

  if p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at < pg_catalog.now() + interval '5 minutes'
    or p_expires_at > pg_catalog.now() + interval '14 days'
  then
    raise exception using errcode = '22023', message = 'Payment-link security details are invalid.';
  end if;

  select * into v_invoice
  from public.invoices
  where organization_id = p_organization_id
    and property_id = p_property_id
    and id = p_invoice_id
  for update;

  if not found
    or v_invoice.state not in ('issued', 'partially_paid', 'overdue')
    or v_invoice.total_amount <= v_invoice.paid_amount
  then
    raise exception using errcode = 'P0001', message = 'This invoice is not payable.';
  end if;

  if exists (
    select 1 from public.payments
    where organization_id = p_organization_id
      and property_id = p_property_id
      and invoice_id = p_invoice_id
      and state = 'pending_review'
  ) then
    raise exception using errcode = 'P0001', message = 'This invoice already has a payment awaiting review.';
  end if;

  update public.invoice_payment_requests
  set state = 'revoked', revoked_at = pg_catalog.now()
  where organization_id = p_organization_id
    and property_id = p_property_id
    and invoice_id = p_invoice_id
    and state = 'active';

  insert into public.invoice_payment_requests (
    id, organization_id, property_id, invoice_id, tenant_id,
    token_hash, expires_at, created_by
  ) values (
    v_request_id, p_organization_id, p_property_id, p_invoice_id, v_invoice.tenant_id,
    p_token_hash, p_expires_at, p_actor_user_id
  );

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    p_actor_user_id,
    'payment_request.created',
    'invoice_payment_request',
    v_request_id::text,
    pg_catalog.jsonb_build_object(
      'invoiceId', p_invoice_id,
      'expiresAt', p_expires_at,
      'tokenStoredAsHashOnly', true
    )
  );

  return pg_catalog.jsonb_build_object(
    'paymentRequestId', v_request_id,
    'invoiceId', p_invoice_id,
    'expiresAt', p_expires_at,
    'state', 'active'
  );
end
$$;

create or replace function public.record_invoice_payment_request_open(
  p_token_hash text,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.invoice_payment_requests;
begin
  update public.invoice_payment_requests
  set last_opened_at = pg_catalog.now(), open_count = open_count + 1
  where token_hash = p_token_hash
    and invoice_id = p_invoice_id
    and state = 'active'
    and expires_at > pg_catalog.now()
  returning * into v_request;

  if not found then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'paymentRequestId', v_request.id,
    'organizationId', v_request.organization_id,
    'propertyId', v_request.property_id,
    'invoiceId', v_request.invoice_id,
    'tenantId', v_request.tenant_id,
    'expiresAt', v_request.expires_at
  );
end
$$;

create or replace function public.submit_public_upi_payment_evidence(
  p_token_hash text,
  p_invoice_id uuid,
  p_amount bigint,
  p_reference text,
  p_paid_at timestamptz,
  p_object_key text,
  p_content_type text,
  p_file_hash text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.invoice_payment_requests;
  v_invoice public.invoices;
  v_payment_id uuid := extensions.gen_random_uuid();
  v_reference text := pg_catalog.upper(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_reference), '[^A-Za-z0-9]', '', 'g')
  );
begin
  select * into v_request
  from public.invoice_payment_requests
  where token_hash = p_token_hash
    and invoice_id = p_invoice_id
    and state = 'active'
    and expires_at > pg_catalog.now()
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'This payment link is invalid or has expired.';
  end if;

  select * into v_invoice
  from public.invoices
  where organization_id = v_request.organization_id
    and property_id = v_request.property_id
    and id = v_request.invoice_id
    and tenant_id = v_request.tenant_id
  for update;

  if not found or v_invoice.state not in ('issued', 'partially_paid', 'overdue') then
    raise exception using errcode = 'P0001', message = 'This invoice cannot accept payment evidence.';
  end if;

  if p_amount <= 0 or p_amount > (v_invoice.total_amount - v_invoice.paid_amount) then
    raise exception using errcode = '22023', message = 'Amount must not exceed the outstanding balance.';
  end if;

  if v_reference !~ '^[A-Z0-9]{6,35}$'
    or p_paid_at < pg_catalog.now() - interval '90 days'
    or p_paid_at > pg_catalog.now() + interval '1 day'
  then
    raise exception using errcode = '22023', message = 'Payment reference or date is invalid.';
  end if;

  if p_file_hash !~ '^[a-f0-9]{64}$'
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_object_key !~ ('^organizations/' || v_request.organization_id::text || '/payment-evidence/[^/]+$')
  then
    raise exception using errcode = '22023', message = 'Screenshot evidence is invalid.';
  end if;

  insert into public.payments (
    id, organization_id, property_id, tenant_id, invoice_id, method,
    amount, reference, state, paid_at, submitted_by, note,
    payment_request_id, submission_channel
  ) values (
    v_payment_id, v_request.organization_id, v_request.property_id, v_request.tenant_id,
    v_request.invoice_id, 'upi', p_amount, v_reference, 'pending_review', p_paid_at,
    null, pg_catalog.left(pg_catalog.btrim(p_note), 500),
    v_request.id, 'public_payment_link'
  );

  insert into public.payment_evidence (
    organization_id, payment_id, object_key, content_type, file_hash
  ) values (
    v_request.organization_id, v_payment_id, p_object_key, p_content_type, p_file_hash
  );

  update public.invoice_payment_requests
  set state = 'submitted', submitted_at = pg_catalog.now()
  where id = v_request.id;

  insert into public.audit_events (
    organization_id, actor_id, actor_kind, action, entity_type, entity_id, after_data
  ) values (
    v_request.organization_id,
    null,
    'public_payment_link',
    'payment.upi_submitted',
    'payment',
    v_payment_id::text,
    pg_catalog.jsonb_build_object(
      'invoiceId', v_request.invoice_id,
      'paymentRequestId', v_request.id,
      'amount', p_amount,
      'state', 'pending_review',
      'autoApproved', false
    )
  );

  return pg_catalog.jsonb_build_object(
    'paymentId', v_payment_id,
    'paymentRequestId', v_request.id,
    'state', 'pending_review',
    'autoApproved', false
  );
end
$$;

revoke all on function public.create_invoice_payment_request(uuid,uuid,uuid,uuid,text,timestamptz) from public;
revoke all on function public.record_invoice_payment_request_open(text,uuid) from public;
revoke all on function public.submit_public_upi_payment_evidence(text,uuid,bigint,text,timestamptz,text,text,text,text) from public;
grant execute on function public.create_invoice_payment_request(uuid,uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.record_invoice_payment_request_open(text,uuid) to service_role;
grant execute on function public.submit_public_upi_payment_evidence(text,uuid,bigint,text,timestamptz,text,text,text,text) to service_role;

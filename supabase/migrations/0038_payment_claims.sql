-- Claims against mistakenly approved payments.
--
-- Approved payments and receipts are never reversed or edited. Instead, staff
-- raise a claim against an approved payment; the owner either dismisses it or
-- upholds it. Upholding issues a new, separately numbered correction invoice
-- for the claimed amount, so the resident's dues are restored while the
-- original payment, receipt and allocations stay intact and auditable.

create table if not exists public.payment_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  payment_id uuid not null,
  tenant_id uuid not null,
  amount bigint not null check (amount > 0),
  reason text not null check (
    reason = pg_catalog.btrim(reason)
    and pg_catalog.char_length(reason) between 5 and 500
    and reason !~ '[[:cntrl:]]'
  ),
  state text not null default 'open' check (state in ('open', 'upheld', 'dismissed')),
  raised_by uuid not null references auth.users(id),
  raised_at timestamptz not null default pg_catalog.now(),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or pg_catalog.char_length(resolution_note) <= 500),
  correction_invoice_id uuid,
  unique (organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete restrict,
  foreign key (organization_id, correction_invoice_id) references public.invoices(organization_id, id) on delete restrict,
  check (
    (state = 'open' and resolved_by is null and resolved_at is null and correction_invoice_id is null)
    or (state = 'dismissed' and resolved_by is not null and resolved_at is not null and correction_invoice_id is null)
    or (state = 'upheld' and resolved_by is not null and resolved_at is not null and correction_invoice_id is not null)
  )
);

-- One open claim per payment, and a payment can only be corrected once.
create unique index if not exists payment_claims_one_open_per_payment
  on public.payment_claims (organization_id, payment_id) where state = 'open';
create unique index if not exists payment_claims_one_upheld_per_payment
  on public.payment_claims (organization_id, payment_id) where state = 'upheld';
create index if not exists payment_claims_org_state_idx
  on public.payment_claims (organization_id, state, raised_at desc);

alter table public.payment_claims enable row level security;
revoke all on public.payment_claims from public, anon, authenticated;
grant select on public.payment_claims to service_role;

drop policy if exists payment_claims_staff_read on public.payment_claims;
create policy payment_claims_staff_read on public.payment_claims
for select to authenticated
using (public.has_org_role(organization_id, array['owner', 'manager', 'accountant']::public.membership_role[]));
grant select on public.payment_claims to authenticated;

create or replace function public.raise_payment_claim(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_payment record;
  v_claim_id uuid;
begin
  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and property_id = p_property_id
      and role in ('owner', 'manager', 'accountant')
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Active PG staff access is required to raise a claim.';
  end if;

  if pg_catalog.char_length(v_reason) not between 5 and 500 or v_reason ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'Describe what went wrong in 5 to 500 characters.';
  end if;

  select payment.id, payment.tenant_id, payment.amount, payment.state
  into v_payment
  from public.payments as payment
  where payment.id = p_payment_id
    and payment.organization_id = p_organization_id
    and payment.property_id = p_property_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Payment not found.';
  end if;
  if v_payment.state <> 'approved' then
    raise exception using errcode = 'P0001', message = 'Claims can only be raised against approved payments.';
  end if;
  if exists (
    select 1 from public.payment_claims
    where organization_id = p_organization_id and payment_id = p_payment_id and state in ('open', 'upheld')
  ) then
    raise exception using errcode = 'P0001', message = 'This payment already has an open or upheld claim.';
  end if;

  insert into public.payment_claims (
    organization_id, property_id, payment_id, tenant_id, amount, reason, raised_by
  ) values (
    p_organization_id, p_property_id, p_payment_id, v_payment.tenant_id, v_payment.amount, v_reason, p_actor_user_id
  ) returning id into v_claim_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id, 'payment.claim_raised', 'payment_claim', v_claim_id::text,
    pg_catalog.jsonb_build_object('paymentId', p_payment_id, 'amount', v_payment.amount, 'reason', v_reason)
  );

  return pg_catalog.jsonb_build_object('claimId', v_claim_id, 'paymentId', p_payment_id, 'state', 'open');
end;
$$;

create or replace function public.resolve_payment_claim(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_claim_id uuid,
  p_decision text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim record;
  v_note text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_note, '')), 500), '');
  v_now timestamptz := pg_catalog.now();
  v_invoice_id uuid;
  v_invoice_number text;
begin
  if p_decision not in ('uphold', 'dismiss') then
    raise exception using errcode = '22023', message = 'Choose uphold or dismiss.';
  end if;

  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id
      and organization_id = p_organization_id
      and role = 'owner'
      and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the PG owner can resolve payment claims.';
  end if;

  select claim.* into v_claim
  from public.payment_claims as claim
  where claim.id = p_claim_id and claim.organization_id = p_organization_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Claim not found.';
  end if;
  if v_claim.state <> 'open' then
    raise exception using errcode = 'P0001', message = 'This claim has already been resolved.';
  end if;

  if p_decision = 'dismiss' then
    update public.payment_claims
    set state = 'dismissed', resolved_by = p_actor_user_id, resolved_at = v_now, resolution_note = v_note
    where id = p_claim_id;
  else
    v_invoice_id := extensions.gen_random_uuid();
    v_invoice_number := 'CORR-' || pg_catalog.upper(pg_catalog.left(pg_catalog.replace(v_invoice_id::text, '-', ''), 12));

    insert into public.invoices (
      id, organization_id, property_id, tenant_id, period, number, due_date, total_amount, paid_amount, state
    ) values (
      v_invoice_id, p_organization_id, v_claim.property_id, v_claim.tenant_id,
      'correction-' || p_claim_id::text, v_invoice_number,
      (v_now at time zone 'Asia/Kolkata')::date + 7, v_claim.amount, 0, 'issued'
    );

    insert into public.invoice_line_items (organization_id, invoice_id, kind, description, amount, metadata)
    values (
      p_organization_id, v_invoice_id, 'adjustment',
      'Correction for a payment approved by mistake',
      v_claim.amount,
      pg_catalog.jsonb_build_object('source', 'payment_claim', 'claimId', p_claim_id, 'paymentId', v_claim.payment_id)
    );

    update public.payment_claims
    set state = 'upheld', resolved_by = p_actor_user_id, resolved_at = v_now,
        resolution_note = v_note, correction_invoice_id = v_invoice_id
    where id = p_claim_id;
  end if;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id,
    case p_decision when 'uphold' then 'payment.claim_upheld' else 'payment.claim_dismissed' end,
    'payment_claim', p_claim_id::text,
    pg_catalog.jsonb_build_object(
      'paymentId', v_claim.payment_id,
      'amount', v_claim.amount,
      'note', v_note,
      'correctionInvoiceId', v_invoice_id,
      'correctionInvoiceNumber', v_invoice_number
    )
  );

  return pg_catalog.jsonb_build_object(
    'claimId', p_claim_id,
    'state', case p_decision when 'uphold' then 'upheld' else 'dismissed' end,
    'correctionInvoiceId', v_invoice_id,
    'correctionInvoiceNumber', v_invoice_number
  );
end;
$$;

revoke all on function public.raise_payment_claim(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_payment_claim(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.raise_payment_claim(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.resolve_payment_claim(uuid, uuid, uuid, text, text) to service_role;

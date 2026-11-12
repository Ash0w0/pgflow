-- Automatic WhatsApp rent reminders and receipts through one PGFlow number.
--
-- * Owners opt in per PG (residents must have agreed to WhatsApp updates).
-- * Messages are queued in a transactional outbox: a receipt is queued in the
--   same transaction that issues it, reminders are queued by a daily job, and
--   a sender delivers them with retries. Idempotency keys prevent duplicates.
-- * Residents get secure, expiring links (stored as hashes only): a payment
--   link for reminders and a receipt link for receipts.

alter table public.properties
  add column if not exists whatsapp_auto_reminders boolean not null default false,
  add column if not exists whatsapp_auto_receipts boolean not null default false,
  add column if not exists whatsapp_language text not null default 'en'
    check (whatsapp_language in ('en', 'hi'));

create table if not exists public.whatsapp_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  kind text not null check (kind in ('rent_reminder', 'payment_receipt')),
  entity_id uuid not null,
  tenant_id uuid not null,
  stage text,
  idempotency_key text not null unique check (pg_catalog.char_length(idempotency_key) between 8 and 200),
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  last_error text check (last_error is null or pg_catalog.char_length(last_error) <= 500),
  wamid text,
  sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete cascade,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete cascade
);
create index if not exists whatsapp_outbox_due_idx on public.whatsapp_outbox (state, next_attempt_at);
create index if not exists whatsapp_outbox_org_idx on public.whatsapp_outbox (organization_id, created_at desc);

alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_outbox from public, anon, authenticated;
grant select, update on public.whatsapp_outbox to service_role;

create table if not exists public.receipt_links (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  check (expires_at > created_at and expires_at <= created_at + interval '400 days'),
  foreign key (organization_id, payment_id) references public.receipts(organization_id, payment_id) on delete cascade
);
alter table public.receipt_links enable row level security;
revoke all on public.receipt_links from public, anon, authenticated;
grant select, insert on public.receipt_links to service_role;

-- Queue the resident's receipt in the same transaction that issues it.
create or replace function public.enqueue_receipt_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.properties
    where organization_id = new.organization_id and id = new.property_id and whatsapp_auto_receipts
  ) then
    insert into public.whatsapp_outbox (organization_id, property_id, kind, entity_id, tenant_id, idempotency_key)
    values (new.organization_id, new.property_id, 'payment_receipt', new.payment_id, new.tenant_id, 'receipt:' || new.payment_id::text)
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_enqueue_whatsapp on public.receipts;
create trigger receipts_enqueue_whatsapp
after insert on public.receipts
for each row execute function public.enqueue_receipt_whatsapp();

-- Queue reminders 3 days before, on, and 3 days after the due date for unpaid
-- invoices of PGs that opted in and are not read-only. Safe to run repeatedly.
create or replace function public.enqueue_rent_reminders(p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_today is null then
    raise exception using errcode = '22023', message = 'A reminder date is required.';
  end if;

  insert into public.whatsapp_outbox (organization_id, property_id, kind, entity_id, tenant_id, stage, idempotency_key)
  select
    invoice.organization_id,
    invoice.property_id,
    'rent_reminder',
    invoice.id,
    invoice.tenant_id,
    stage.name,
    'reminder:' || invoice.id::text || ':' || stage.name
  from public.invoices as invoice
  join public.properties as property
    on property.organization_id = invoice.organization_id and property.id = invoice.property_id
  join public.tenant_profiles as tenant
    on tenant.organization_id = invoice.organization_id and tenant.id = invoice.tenant_id
  cross join lateral (
    select case
      when invoice.due_date = p_today + 3 then 'before_due'
      when invoice.due_date = p_today then 'due_today'
      when invoice.due_date = p_today - 3 then 'overdue'
    end as name
  ) as stage
  where property.whatsapp_auto_reminders
    and stage.name is not null
    and invoice.state in ('issued', 'partially_paid', 'overdue')
    and invoice.total_amount > invoice.paid_amount
    and tenant.state in ('active', 'notice')
    and public.organization_plan_status(invoice.organization_id) <> 'expired'
    and not exists (
      select 1 from public.payments as payment
      where payment.organization_id = invoice.organization_id
        and payment.invoice_id = invoice.id
        and payment.state = 'pending_review'
    )
  on conflict (idempotency_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Atomically claim due outbox rows for one sender run (skip rows another run holds).
create or replace function public.claim_whatsapp_outbox(p_limit integer, p_organization_id uuid)
returns setof public.whatsapp_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Recover rows left in 'sending' by a crashed run.
  update public.whatsapp_outbox
  set state = 'pending', updated_at = pg_catalog.now()
  where state = 'sending' and updated_at < pg_catalog.now() - interval '15 minutes';

  return query
  update public.whatsapp_outbox as outbox
  set state = 'sending', attempts = outbox.attempts + 1, updated_at = pg_catalog.now()
  where outbox.id in (
    select candidate.id from public.whatsapp_outbox as candidate
    where candidate.state = 'pending'
      and candidate.next_attempt_at <= pg_catalog.now()
      and (p_organization_id is null or candidate.organization_id = p_organization_id)
    order by candidate.created_at
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    for update skip locked
  )
  returning outbox.*;
end;
$$;

-- Payment links issued by the reminder job on the owner's behalf.
create or replace function public.create_system_payment_request(
  p_organization_id uuid,
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
  v_owner uuid;
  v_request_id uuid := extensions.gen_random_uuid();
begin
  if p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at < pg_catalog.now() + interval '5 minutes'
    or p_expires_at > pg_catalog.now() + interval '14 days'
  then
    raise exception using errcode = '22023', message = 'Payment-link security details are invalid.';
  end if;

  select * into v_invoice from public.invoices
  where organization_id = p_organization_id and id = p_invoice_id
  for update;
  if not found
    or v_invoice.state not in ('issued', 'partially_paid', 'overdue')
    or v_invoice.total_amount <= v_invoice.paid_amount
  then
    raise exception using errcode = 'P0001', message = 'This invoice is not payable.';
  end if;

  select auth_user_id into v_owner from public.memberships
  where organization_id = p_organization_id and role = 'owner' and state = 'active'
  order by created_at limit 1;
  if v_owner is null then
    raise exception using errcode = 'P0001', message = 'The PG has no active owner.';
  end if;

  update public.invoice_payment_requests
  set state = 'revoked', revoked_at = pg_catalog.now()
  where organization_id = p_organization_id and invoice_id = p_invoice_id and state = 'active';

  insert into public.invoice_payment_requests (
    id, organization_id, property_id, invoice_id, tenant_id, token_hash, expires_at, created_by
  ) values (
    v_request_id, p_organization_id, v_invoice.property_id, p_invoice_id, v_invoice.tenant_id,
    p_token_hash, p_expires_at, v_owner
  );

  insert into public.audit_events (organization_id, actor_id, actor_kind, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, null, 'system', 'payment_request.created_by_reminder', 'invoice_payment_request', v_request_id::text,
    pg_catalog.jsonb_build_object('invoiceId', p_invoice_id, 'expiresAt', p_expires_at, 'tokenStoredAsHashOnly', true)
  );

  return pg_catalog.jsonb_build_object('paymentRequestId', v_request_id, 'invoiceId', p_invoice_id, 'expiresAt', p_expires_at);
end;
$$;

create or replace function public.update_property_whatsapp_automation(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_property_id uuid,
  p_auto_reminders boolean,
  p_auto_receipts boolean,
  p_language text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.memberships
    where auth_user_id = p_actor_user_id and organization_id = p_organization_id
      and property_id = p_property_id and role = 'owner' and state = 'active'
  ) then
    raise exception using errcode = '42501', message = 'Only the active property owner can change WhatsApp automation.';
  end if;
  if p_language not in ('en', 'hi') or p_auto_reminders is null or p_auto_receipts is null then
    raise exception using errcode = '22023', message = 'The WhatsApp settings are invalid.';
  end if;

  update public.properties
  set whatsapp_auto_reminders = p_auto_reminders,
      whatsapp_auto_receipts = p_auto_receipts,
      whatsapp_language = p_language,
      updated_at = pg_catalog.now()
  where organization_id = p_organization_id and id = p_property_id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_organization_id, p_actor_user_id, 'property.whatsapp_automation_updated', 'property', p_property_id::text,
    pg_catalog.jsonb_build_object('autoReminders', p_auto_reminders, 'autoReceipts', p_auto_receipts, 'language', p_language)
  );

  return pg_catalog.jsonb_build_object('autoReminders', p_auto_reminders, 'autoReceipts', p_auto_receipts, 'language', p_language);
end;
$$;

revoke all on function public.enqueue_receipt_whatsapp() from public, anon, authenticated;
revoke all on function public.enqueue_rent_reminders(date) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_outbox(integer, uuid) from public, anon, authenticated;
revoke all on function public.create_system_payment_request(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.update_property_whatsapp_automation(uuid, uuid, uuid, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.enqueue_rent_reminders(date) to service_role;
grant execute on function public.claim_whatsapp_outbox(integer, uuid) to service_role;
grant execute on function public.create_system_payment_request(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.update_property_whatsapp_automation(uuid, uuid, uuid, boolean, boolean, text) to service_role;

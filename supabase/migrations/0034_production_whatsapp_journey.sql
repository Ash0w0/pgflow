-- Durable, consent-aware WhatsApp transport for PGFlow.
-- Provider secrets stay in Vercel; this schema stores only routing metadata.

create table public.whatsapp_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  label text not null,
  waba_id text not null unique,
  phone_number_id text not null unique,
  display_phone_masked text not null default '',
  graph_version text not null,
  state text not null default 'disabled'
    check (state in ('disabled', 'test', 'live', 'degraded')),
  last_template_sync_at timestamptz,
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.whatsapp_contacts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete restrict,
  tenant_id uuid,
  membership_id uuid,
  role text not null check (role in ('resident', 'owner', 'manager', 'accountant')),
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  display_name text not null,
  language_code text not null default 'en' check (language_code in ('en', 'hi')),
  timezone text not null default 'Asia/Kolkata',
  consent_state text not null default 'unknown'
    check (consent_state in ('unknown', 'opted_in', 'opted_out')),
  essential_enabled boolean not null default true,
  reminders_enabled boolean not null default false,
  weekly_report_enabled boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, phone_e164, role),
  unique (organization_id, id),
  foreign key (organization_id, tenant_id)
    references public.tenant_profiles(organization_id, id) on delete cascade,
  foreign key (organization_id, membership_id)
    references public.memberships(organization_id, id) on delete cascade,
  check (
    (role = 'resident' and tenant_id is not null and membership_id is null)
    or (role <> 'resident' and membership_id is not null and tenant_id is null)
  )
);
create index whatsapp_contacts_phone_idx on public.whatsapp_contacts(phone_e164);
create index whatsapp_contacts_org_consent_idx
  on public.whatsapp_contacts(organization_id, consent_state);

create table public.whatsapp_consent_events (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  event text not null check (
    event in ('opt_in', 'opt_out', 'language', 'reminders', 'weekly_report', 'policy')
  ),
  source text not null check (source in ('activation_link', 'inbound_command', 'operator')),
  policy_version text,
  value jsonb not null default '{}'::jsonb,
  provider_wamid text,
  occurred_at timestamptz not null default pg_catalog.now(),
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade
);
create index whatsapp_consent_events_contact_idx
  on public.whatsapp_consent_events(organization_id, contact_id, occurred_at desc);

create table public.whatsapp_activation_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  policy_version text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete cascade
);
create index whatsapp_activation_tokens_active_idx
  on public.whatsapp_activation_tokens(expires_at) where used_at is null;

create table public.whatsapp_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  purpose text not null,
  meta_name text not null,
  language_code text not null check (language_code in ('en', 'hi')),
  category text not null default 'UTILITY',
  parameter_schema jsonb not null default '[]'::jsonb,
  approval_state text not null default 'unknown'
    check (approval_state in ('unknown', 'pending', 'approved', 'paused', 'disabled', 'rejected')),
  quality_state text not null default 'unknown',
  last_sync_result jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (connection_id, purpose, language_code),
  unique (connection_id, meta_name, language_code)
);

create table public.whatsapp_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete restrict,
  contact_id uuid,
  direction text not null check (direction in ('inbound', 'outbound')),
  kind text not null,
  language_code text check (language_code in ('en', 'hi')),
  template_id uuid references public.whatsapp_templates(id) on delete restrict,
  provider_wamid text unique,
  reply_to_wamid text,
  dedupe_key text,
  state text not null default 'queued' check (state in (
    'queued', 'leased', 'provider_accepted', 'sent', 'delivered', 'read',
    'retry_wait', 'delivery_uncertain', 'failed', 'dead_letter',
    'suppressed', 'cancelled'
  )),
  state_rank smallint not null default 0,
  intent jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, dedupe_key),
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete restrict
);
create index whatsapp_messages_org_created_idx
  on public.whatsapp_messages(organization_id, created_at desc);
create index whatsapp_messages_reply_idx on public.whatsapp_messages(reply_to_wamid);

create table public.whatsapp_outbox_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null unique references public.whatsapp_messages(id) on delete cascade,
  dedupe_key text not null,
  state text not null default 'queued'
    check (state in ('queued', 'leased', 'retry_wait', 'completed', 'dead_letter', 'suppressed', 'cancelled')),
  available_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts between 1 and 25),
  last_error_code text,
  last_error_summary text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, dedupe_key)
);
create index whatsapp_outbox_claim_idx
  on public.whatsapp_outbox_jobs(state, available_at, created_at)
  where state in ('queued', 'retry_wait', 'leased');

create table public.whatsapp_delivery_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  outbox_job_id uuid not null references public.whatsapp_outbox_jobs(id) on delete cascade,
  attempt_number integer not null,
  outcome text not null check (
    outcome in ('provider_accepted', 'retryable', 'delivery_uncertain', 'permanent_failure', 'suppressed')
  ),
  provider_wamid text,
  http_status integer,
  provider_error_code text,
  error_summary text,
  started_at timestamptz not null,
  completed_at timestamptz not null default pg_catalog.now(),
  unique (outbox_job_id, attempt_number)
);

create table public.whatsapp_status_events (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid references public.whatsapp_messages(id) on delete set null,
  provider_wamid text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  provider_timestamp timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default pg_catalog.now(),
  unique (provider_wamid, status, provider_timestamp)
);

create table public.whatsapp_webhook_events (
  id uuid primary key default extensions.gen_random_uuid(),
  connection_id uuid references public.whatsapp_connections(id) on delete restrict,
  provider_event_key text not null unique,
  entry_id text,
  phone_number_id text,
  event_kind text not null check (event_kind in ('message', 'status', 'error', 'unknown')),
  provider_wamid text,
  payload jsonb not null,
  state text not null default 'pending'
    check (state in ('pending', 'leased', 'retry_wait', 'processed', 'dead_letter')),
  available_at timestamptz not null default pg_catalog.now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  lease_owner text,
  attempts integer not null default 0,
  last_error_summary text,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz
);
create index whatsapp_webhook_claim_idx
  on public.whatsapp_webhook_events(state, available_at, received_at)
  where state in ('pending', 'retry_wait', 'leased');

create table public.whatsapp_conversations (
  id uuid primary key default extensions.gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete restrict,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  organization_id uuid references public.organizations(id) on delete cascade,
  flow text not null default 'menu',
  state text not null default 'active'
    check (state in ('active', 'awaiting_pg', 'awaiting_invoice', 'awaiting_utr', 'awaiting_payment_date', 'resolved', 'operator_review')),
  context jsonb not null default '{}'::jsonb,
  last_inbound_wamid text,
  expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (connection_id, phone_e164)
);
create index whatsapp_conversations_operator_idx
  on public.whatsapp_conversations(state, updated_at)
  where state in ('awaiting_pg', 'operator_review');

create table public.whatsapp_action_challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null,
  membership_id uuid not null,
  action text not null check (action in ('payment_approve', 'payment_reject', 'rent_issue', 'maintenance_update', 'move_out_acknowledge')),
  entity_type text not null,
  entity_id uuid not null,
  context_wamid text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending', 'used', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  used_at timestamptz,
  result_entity_id uuid,
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (organization_id, contact_id)
    references public.whatsapp_contacts(organization_id, id) on delete restrict,
  foreign key (organization_id, membership_id)
    references public.memberships(organization_id, id) on delete restrict
);
create index whatsapp_action_challenges_active_idx
  on public.whatsapp_action_challenges(token_hash, expires_at) where state = 'pending';

create table public.resident_receipt_links (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id uuid not null,
  tenant_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  open_count integer not null default 0,
  last_opened_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, receipt_id),
  foreign key (organization_id, receipt_id)
    references public.receipts(organization_id, id) on delete cascade,
  foreign key (organization_id, tenant_id)
    references public.tenant_profiles(organization_id, id) on delete cascade
);

create table public.whatsapp_worker_heartbeats (
  worker text primary key check (worker in ('outbox', 'webhook', 'weekly_report')),
  environment text not null check (environment in ('local', 'staging', 'production')),
  last_started_at timestamptz not null,
  last_completed_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_consent_events enable row level security;
alter table public.whatsapp_activation_tokens enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_outbox_jobs enable row level security;
alter table public.whatsapp_delivery_attempts enable row level security;
alter table public.whatsapp_status_events enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_action_challenges enable row level security;
alter table public.resident_receipt_links enable row level security;
alter table public.whatsapp_worker_heartbeats enable row level security;

revoke all on table
  public.whatsapp_connections,
  public.whatsapp_contacts,
  public.whatsapp_consent_events,
  public.whatsapp_activation_tokens,
  public.whatsapp_templates,
  public.whatsapp_messages,
  public.whatsapp_outbox_jobs,
  public.whatsapp_delivery_attempts,
  public.whatsapp_status_events,
  public.whatsapp_webhook_events,
  public.whatsapp_conversations,
  public.whatsapp_action_challenges,
  public.resident_receipt_links,
  public.whatsapp_worker_heartbeats
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.whatsapp_connections,
  public.whatsapp_contacts,
  public.whatsapp_consent_events,
  public.whatsapp_activation_tokens,
  public.whatsapp_templates,
  public.whatsapp_messages,
  public.whatsapp_outbox_jobs,
  public.whatsapp_delivery_attempts,
  public.whatsapp_status_events,
  public.whatsapp_webhook_events,
  public.whatsapp_conversations,
  public.whatsapp_action_challenges,
  public.resident_receipt_links,
  public.whatsapp_worker_heartbeats
to service_role;

create or replace function public.enqueue_whatsapp_intent(
  p_organization_id uuid,
  p_connection_id uuid,
  p_contact_id uuid,
  p_kind text,
  p_language_code text,
  p_dedupe_key text,
  p_intent jsonb,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_created boolean := false;
begin
  if pg_catalog.btrim(pg_catalog.coalesce(p_dedupe_key, '')) = ''
    or p_language_code not in ('en', 'hi')
  then
    raise exception using errcode = '22023', message = 'Invalid WhatsApp intent.';
  end if;

  select id into v_message_id
  from public.whatsapp_messages
  where organization_id = p_organization_id and dedupe_key = p_dedupe_key;

  if v_message_id is null then
    v_message_id := extensions.gen_random_uuid();
    insert into public.whatsapp_messages (
      id, organization_id, connection_id, contact_id, direction, kind,
      language_code, dedupe_key, state, intent
    ) values (
      v_message_id, p_organization_id, p_connection_id, p_contact_id, 'outbound',
      p_kind, p_language_code, p_dedupe_key, 'queued', p_intent
    );
    insert into public.whatsapp_outbox_jobs (
      organization_id, message_id, dedupe_key, expires_at
    ) values (
      p_organization_id, v_message_id, p_dedupe_key, p_expires_at
    );
    v_created := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'messageId', v_message_id,
    'state', 'queued',
    'deduplicated', not v_created
  );
end
$$;

create or replace function public.claim_whatsapp_outbox(
  p_worker text,
  p_limit integer default 20,
  p_lease_seconds integer default 90
)
returns setof public.whatsapp_outbox_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.whatsapp_outbox_jobs job
    where (
      job.state in ('queued', 'retry_wait')
      and job.available_at <= pg_catalog.now()
    ) or (
      job.state = 'leased'
      and job.lease_expires_at < pg_catalog.now()
    )
    order by job.available_at, job.created_at
    for update skip locked
    limit pg_catalog.least(pg_catalog.greatest(p_limit, 1), 100)
  )
  update public.whatsapp_outbox_jobs job
  set state = 'leased',
      leased_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => pg_catalog.greatest(p_lease_seconds, 15)),
      lease_owner = p_worker,
      attempts = job.attempts + 1,
      updated_at = pg_catalog.now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end
$$;

create or replace function public.finish_whatsapp_outbox(
  p_job_id uuid,
  p_worker text,
  p_outcome text,
  p_available_at timestamptz default null,
  p_error_code text default null,
  p_error_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  v_state := case p_outcome
    when 'completed' then 'completed'
    when 'retry_wait' then 'retry_wait'
    when 'delivery_uncertain' then 'completed'
    when 'dead_letter' then 'dead_letter'
    when 'suppressed' then 'suppressed'
    else null
  end;
  if v_state is null then
    raise exception using errcode = '22023', message = 'Invalid outbox outcome.';
  end if;

  update public.whatsapp_outbox_jobs
  set state = v_state,
      available_at = pg_catalog.coalesce(p_available_at, available_at),
      lease_expires_at = null,
      lease_owner = null,
      last_error_code = p_error_code,
      last_error_summary = pg_catalog.left(p_error_summary, 500),
      updated_at = pg_catalog.now()
  where id = p_job_id and state = 'leased' and lease_owner = p_worker;
  return found;
end
$$;

create or replace function public.claim_whatsapp_webhooks(
  p_worker text,
  p_limit integer default 50,
  p_lease_seconds integer default 90
)
returns setof public.whatsapp_webhook_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select event.id
    from public.whatsapp_webhook_events event
    where (
      event.state in ('pending', 'retry_wait')
      and event.available_at <= pg_catalog.now()
    ) or (
      event.state = 'leased'
      and event.lease_expires_at < pg_catalog.now()
    )
    order by event.available_at, event.received_at
    for update skip locked
    limit pg_catalog.least(pg_catalog.greatest(p_limit, 1), 200)
  )
  update public.whatsapp_webhook_events event
  set state = 'leased',
      leased_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => pg_catalog.greatest(p_lease_seconds, 15)),
      lease_owner = p_worker,
      attempts = event.attempts + 1
  from candidates
  where event.id = candidates.id
  returning event.*;
end
$$;

revoke all on function public.enqueue_whatsapp_intent(uuid,uuid,uuid,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_outbox(text,integer,integer) from public, anon, authenticated;
revoke all on function public.finish_whatsapp_outbox(uuid,text,text,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_webhooks(text,integer,integer) from public, anon, authenticated;
grant execute on function public.enqueue_whatsapp_intent(uuid,uuid,uuid,text,text,text,jsonb,timestamptz) to service_role;
grant execute on function public.claim_whatsapp_outbox(text,integer,integer) to service_role;
grant execute on function public.finish_whatsapp_outbox(uuid,text,text,timestamptz,text,text) to service_role;
grant execute on function public.claim_whatsapp_webhooks(text,integer,integer) to service_role;

comment on table public.whatsapp_webhook_events is
  'Raw idempotent webhook slices persisted before Meta receives HTTP 200.';
comment on table public.whatsapp_outbox_jobs is
  'Durable logical delivery queue. A provider timeout is never blindly retried.';

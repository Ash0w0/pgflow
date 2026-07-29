-- Close the crash/retry gaps in the production WhatsApp queue.

alter table public.whatsapp_messages
  add column if not exists last_provider_timestamp timestamptz;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_org_id_uq unique (organization_id, id);

alter table public.whatsapp_outbox_jobs
  add constraint whatsapp_outbox_jobs_org_id_uq unique (organization_id, id);

alter table public.whatsapp_outbox_jobs
  add constraint whatsapp_outbox_jobs_org_message_fk
  foreign key (organization_id, message_id)
  references public.whatsapp_messages(organization_id, id) on delete cascade;

alter table public.whatsapp_delivery_attempts
  add constraint whatsapp_delivery_attempts_org_message_fk
  foreign key (organization_id, message_id)
  references public.whatsapp_messages(organization_id, id) on delete cascade;

alter table public.whatsapp_delivery_attempts
  add constraint whatsapp_delivery_attempts_org_job_fk
  foreign key (organization_id, outbox_job_id)
  references public.whatsapp_outbox_jobs(organization_id, id) on delete cascade;

create unique index if not exists whatsapp_consent_events_provider_uq
  on public.whatsapp_consent_events(contact_id, provider_wamid, event);

alter table public.whatsapp_consent_events
  drop constraint whatsapp_consent_events_event_check,
  add constraint whatsapp_consent_events_event_check check (
    event in (
      'opt_in', 'opt_out', 'language', 'reminders',
      'weekly_report', 'essential', 'policy'
    )
  );

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
  v_candidate_id uuid;
  v_created boolean := false;
begin
  if pg_catalog.btrim(pg_catalog.coalesce(p_dedupe_key, '')) = ''
    or p_language_code not in ('en', 'hi')
  then
    raise exception using errcode = '22023', message = 'Invalid WhatsApp intent.';
  end if;

  if not exists (
    select 1
    from public.whatsapp_contacts contact
    where contact.id = p_contact_id
      and contact.organization_id = p_organization_id
      and contact.connection_id = p_connection_id
  ) then
    raise exception using errcode = '42501', message = 'WhatsApp contact context is invalid.';
  end if;

  v_candidate_id := extensions.gen_random_uuid();
  insert into public.whatsapp_messages (
    id, organization_id, connection_id, contact_id, direction, kind,
    language_code, dedupe_key, state, intent
  ) values (
    v_candidate_id, p_organization_id, p_connection_id, p_contact_id, 'outbound',
    p_kind, p_language_code, p_dedupe_key, 'queued', p_intent
  )
  on conflict (organization_id, dedupe_key) do nothing
  returning id into v_message_id;

  if found then
    insert into public.whatsapp_outbox_jobs (
      organization_id, message_id, dedupe_key, expires_at
    ) values (
      p_organization_id, v_message_id, p_dedupe_key, p_expires_at
    );
    v_created := true;
  else
    select message.id into strict v_message_id
    from public.whatsapp_messages message
    where message.organization_id = p_organization_id
      and message.dedupe_key = p_dedupe_key;
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
  p_limit integer default 1,
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
    where job.state in ('queued', 'retry_wait')
      and job.available_at <= pg_catalog.now()
    order by job.available_at, job.created_at
    for update skip locked
    limit pg_catalog.least(pg_catalog.greatest(p_limit, 1), 10)
  )
  update public.whatsapp_outbox_jobs job
  set state = 'leased',
      leased_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(secs => pg_catalog.greatest(p_lease_seconds, 30)),
      lease_owner = p_worker,
      attempts = job.attempts + 1,
      updated_at = pg_catalog.now()
  from candidates
  where job.id = candidates.id
  returning job.*;
end
$$;

create or replace function public.recover_stale_whatsapp_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered integer := 0;
begin
  with stale as (
    select job.id, job.organization_id, job.message_id, job.attempts
    from public.whatsapp_outbox_jobs job
    where job.state = 'leased'
      and job.lease_expires_at < pg_catalog.now()
    for update skip locked
  ), attempts as (
    insert into public.whatsapp_delivery_attempts (
      organization_id, message_id, outbox_job_id, attempt_number, outcome,
      error_summary, started_at
    )
    select
      stale.organization_id, stale.message_id, stale.id, stale.attempts,
      'delivery_uncertain', 'Worker lease expired after dispatch may have started.',
      pg_catalog.now()
    from stale
    on conflict (outbox_job_id, attempt_number) do nothing
    returning outbox_job_id
  ), messages as (
    update public.whatsapp_messages message
    set state = 'delivery_uncertain',
        error_code = 'stale_delivery_lease',
        updated_at = pg_catalog.now()
    from stale
    where message.id = stale.message_id
      and message.organization_id = stale.organization_id
    returning message.id
  )
  update public.whatsapp_outbox_jobs job
  set state = 'completed',
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = 'stale_delivery_lease',
      last_error_summary = 'Delivery requires operator reconciliation before replay.',
      updated_at = pg_catalog.now()
  from stale
  where job.id = stale.id;

  get diagnostics v_recovered = row_count;
  return v_recovered;
end
$$;

create or replace function public.complete_whatsapp_outbox_attempt(
  p_job_id uuid,
  p_worker text,
  p_outcome text,
  p_provider_wamid text default null,
  p_http_status integer default null,
  p_error_code text default null,
  p_error_summary text default null,
  p_available_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.whatsapp_outbox_jobs;
  v_message_state text;
  v_job_state text;
begin
  if p_outcome not in (
    'provider_accepted', 'retryable', 'delivery_uncertain',
    'permanent_failure', 'suppressed'
  ) then
    raise exception using errcode = '22023', message = 'Invalid WhatsApp attempt outcome.';
  end if;
  if p_outcome = 'provider_accepted' and p_provider_wamid is null then
    raise exception using errcode = '22023', message = 'Provider acceptance requires a WAMID.';
  end if;

  select * into v_job
  from public.whatsapp_outbox_jobs
  where id = p_job_id
    and state = 'leased'
    and lease_owner = p_worker
  for update;
  if not found then return false; end if;

  v_message_state := case p_outcome
    when 'provider_accepted' then 'provider_accepted'
    when 'retryable' then 'retry_wait'
    when 'delivery_uncertain' then 'delivery_uncertain'
    when 'permanent_failure' then 'dead_letter'
    when 'suppressed' then 'suppressed'
  end;
  v_job_state := case p_outcome
    when 'provider_accepted' then 'completed'
    when 'retryable' then 'retry_wait'
    when 'delivery_uncertain' then 'completed'
    when 'permanent_failure' then 'dead_letter'
    when 'suppressed' then 'suppressed'
  end;

  insert into public.whatsapp_delivery_attempts (
    organization_id, message_id, outbox_job_id, attempt_number, outcome,
    provider_wamid, http_status, provider_error_code, error_summary, started_at
  ) values (
    v_job.organization_id, v_job.message_id, v_job.id, v_job.attempts, p_outcome,
    p_provider_wamid, p_http_status, p_error_code,
    pg_catalog.left(p_error_summary, 500), pg_catalog.coalesce(v_job.leased_at, pg_catalog.now())
  )
  on conflict (outbox_job_id, attempt_number) do nothing;

  update public.whatsapp_messages
  set state = v_message_state,
      provider_wamid = case
        when p_outcome = 'provider_accepted' then p_provider_wamid
        else provider_wamid
      end,
      error_code = case
        when p_outcome = 'provider_accepted' then null
        else pg_catalog.coalesce(p_error_code, p_outcome)
      end,
      updated_at = pg_catalog.now()
  where id = v_job.message_id
    and organization_id = v_job.organization_id;

  if p_outcome = 'provider_accepted' and p_provider_wamid is not null then
    update public.whatsapp_action_challenges
    set context_wamid = p_provider_wamid
    where context_wamid = v_job.message_id::text
      and state = 'pending';
  end if;

  update public.whatsapp_outbox_jobs
  set state = v_job_state,
      available_at = case
        when v_job_state = 'retry_wait' then
          pg_catalog.coalesce(p_available_at, pg_catalog.now() + interval '1 minute')
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      last_error_summary = pg_catalog.left(p_error_summary, 500),
      updated_at = pg_catalog.now()
  where id = v_job.id;

  return true;
end
$$;

create or replace function public.finish_whatsapp_webhook(
  p_event_id uuid,
  p_worker text,
  p_outcome text,
  p_available_at timestamptz default null,
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
    when 'processed' then 'processed'
    when 'retry_wait' then 'retry_wait'
    when 'dead_letter' then 'dead_letter'
    else null
  end;
  if v_state is null then
    raise exception using errcode = '22023', message = 'Invalid webhook outcome.';
  end if;

  update public.whatsapp_webhook_events
  set state = v_state,
      processed_at = case when v_state = 'processed' then pg_catalog.now() else processed_at end,
      available_at = case
        when v_state = 'retry_wait' then pg_catalog.coalesce(p_available_at, pg_catalog.now() + interval '1 minute')
        else available_at
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error_summary = pg_catalog.left(p_error_summary, 500)
  where id = p_event_id
    and state = 'leased'
    and lease_owner = p_worker;
  return found;
end
$$;

create or replace function public.apply_whatsapp_status(
  p_provider_wamid text,
  p_status text,
  p_provider_timestamp timestamptz,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.whatsapp_messages;
  v_rank smallint;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid WhatsApp status.';
  end if;

  select * into v_message
  from public.whatsapp_messages
  where provider_wamid = p_provider_wamid
  for update;
  if not found then return false; end if;

  insert into public.whatsapp_status_events (
    organization_id, message_id, provider_wamid, status, provider_timestamp, payload
  ) values (
    v_message.organization_id, v_message.id, p_provider_wamid, p_status,
    p_provider_timestamp, pg_catalog.coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider_wamid, status, provider_timestamp) do nothing;

  if v_message.last_provider_timestamp is not null
    and p_provider_timestamp < v_message.last_provider_timestamp
  then
    return true;
  end if;

  if p_status = 'failed' then
    if v_message.state_rank < 2 then
      update public.whatsapp_messages
      set state = 'failed',
          state_rank = 100,
          last_provider_timestamp = p_provider_timestamp,
          updated_at = pg_catalog.now()
      where id = v_message.id;
    end if;
    return true;
  end if;

  v_rank := case p_status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 end;
  if v_message.state_rank < v_rank then
    update public.whatsapp_messages
    set state = p_status,
        state_rank = v_rank,
        last_provider_timestamp = p_provider_timestamp,
        updated_at = pg_catalog.now()
    where id = v_message.id;
  end if;
  return true;
end
$$;

create or replace function public.replay_whatsapp_dead_letter(
  p_job_id uuid,
  p_operator_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.whatsapp_outbox_jobs;
  v_message public.whatsapp_messages;
begin
  select * into v_job
  from public.whatsapp_outbox_jobs
  where id = p_job_id and state = 'dead_letter'
  for update;
  if not found then return false; end if;

  select * into strict v_message
  from public.whatsapp_messages
  where id = v_job.message_id
    and organization_id = v_job.organization_id
  for update;
  if v_message.provider_wamid is not null or v_message.state = 'delivery_uncertain' then
    raise exception using errcode = 'P0001', message = 'This delivery is not safe to replay automatically.';
  end if;

  update public.whatsapp_outbox_jobs
  set state = 'queued',
      available_at = pg_catalog.now(),
      max_attempts = attempts + 8,
      last_error_code = null,
      last_error_summary = null,
      updated_at = pg_catalog.now()
  where id = v_job.id;
  update public.whatsapp_messages
  set state = 'queued', error_code = null, updated_at = pg_catalog.now()
  where id = v_message.id;
  insert into public.audit_events (
    organization_id, actor_id, actor_kind, action, entity_type, entity_id, after_data
  ) values (
    v_job.organization_id, p_operator_id, 'user', 'whatsapp.dead_letter_replayed',
    'whatsapp_outbox_job', v_job.id::text,
    pg_catalog.jsonb_build_object(
      'safeReplay', true,
      'messageId', v_job.message_id,
      'attemptsPreserved', v_job.attempts
    )
  );
  return true;
end
$$;

revoke all on function public.recover_stale_whatsapp_outbox() from public, anon, authenticated;
revoke all on function public.complete_whatsapp_outbox_attempt(uuid,text,text,text,integer,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.finish_whatsapp_webhook(uuid,text,text,timestamptz,text)
  from public, anon, authenticated;
revoke all on function public.apply_whatsapp_status(text,text,timestamptz,jsonb)
  from public, anon, authenticated;
revoke all on function public.replay_whatsapp_dead_letter(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.recover_stale_whatsapp_outbox() to service_role;
grant execute on function public.complete_whatsapp_outbox_attempt(uuid,text,text,text,integer,text,text,timestamptz)
  to service_role;
grant execute on function public.finish_whatsapp_webhook(uuid,text,text,timestamptz,text)
  to service_role;
grant execute on function public.apply_whatsapp_status(text,text,timestamptz,jsonb)
  to service_role;
grant execute on function public.replay_whatsapp_dead_letter(uuid,uuid)
  to service_role;

revoke update, delete on public.whatsapp_consent_events from service_role;
revoke update, delete on public.whatsapp_delivery_attempts from service_role;
revoke update, delete on public.whatsapp_status_events from service_role;
grant select, insert on public.whatsapp_consent_events to service_role;
grant select, insert on public.whatsapp_delivery_attempts to service_role;
grant select, insert on public.whatsapp_status_events to service_role;

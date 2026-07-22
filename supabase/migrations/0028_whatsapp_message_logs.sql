-- Create table for WhatsApp message audit logs & delivery status tracking
create table if not exists public.whatsapp_message_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid references public.tenant_profiles(id) on delete set null,
  recipient_phone text not null,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  template_name text,
  language_code text default 'en',
  wamid text,
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'delivered', 'read', 'failed')),
  idempotency_key text unique,
  payload jsonb,
  error_details jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index if not exists whatsapp_logs_org_idx
  on public.whatsapp_message_logs (organization_id, created_at desc);

create index if not exists whatsapp_logs_phone_idx
  on public.whatsapp_message_logs (recipient_phone);

create index if not exists whatsapp_logs_wamid_idx
  on public.whatsapp_message_logs (wamid);

alter table public.whatsapp_message_logs enable row level security;
revoke all on public.whatsapp_message_logs from public, anon, authenticated, service_role;
grant select on public.whatsapp_message_logs to service_role;

-- RPC function to log WhatsApp dispatch or inbound webhook
create or replace function public.log_whatsapp_message(
  p_organization_id uuid,
  p_recipient_phone text,
  p_direction text default 'outbound',
  p_template_name text default null,
  p_language_code text default 'en',
  p_wamid text default null,
  p_delivery_status text default 'sent',
  p_idempotency_key text default null,
  p_payload jsonb default null,
  p_resident_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_log_id uuid;
begin
  if p_organization_id is null or pg_catalog.btrim(p_recipient_phone) = '' then
    raise exception using errcode = '22023', message = 'Missing organization or phone number.';
  end if;

  insert into public.whatsapp_message_logs (
    organization_id,
    resident_id,
    recipient_phone,
    direction,
    template_name,
    language_code,
    wamid,
    delivery_status,
    idempotency_key,
    payload,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_resident_id,
    pg_catalog.btrim(p_recipient_phone),
    pg_catalog.coalesce(p_direction, 'outbound'),
    p_template_name,
    pg_catalog.coalesce(p_language_code, 'en'),
    p_wamid,
    pg_catalog.coalesce(p_delivery_status, 'sent'),
    p_idempotency_key,
    p_payload,
    v_now,
    v_now
  )
  on conflict (idempotency_key) do update
  set delivery_status = excluded.delivery_status,
      wamid = pg_catalog.coalesce(excluded.wamid, public.whatsapp_message_logs.wamid),
      updated_at = v_now
  returning id into v_log_id;

  return pg_catalog.jsonb_build_object(
    'logId', v_log_id,
    'status', p_delivery_status,
    'wamid', p_wamid
  );
end;
$function$;

revoke all on function public.log_whatsapp_message(uuid, text, text, text, text, text, text, text, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.log_whatsapp_message(uuid, text, text, text, text, text, text, text, jsonb, uuid)
  to service_role;

comment on table public.whatsapp_message_logs is
  'Audited delivery ledger for outbound and inbound WhatsApp Cloud API messages.';

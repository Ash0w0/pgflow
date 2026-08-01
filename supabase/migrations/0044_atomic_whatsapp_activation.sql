-- Make contact routing and one-time activation deterministic and atomic.

alter table public.whatsapp_contacts
  add column if not exists routing_active boolean not null default true;

with ranked_contacts as (
  select contact.id,
    pg_catalog.row_number() over (
      partition by contact.organization_id, contact.tenant_id
      order by contact.activated_at desc nulls last,
        contact.updated_at desc, contact.created_at desc, contact.id desc
    ) as routing_rank
  from public.whatsapp_contacts as contact
  where contact.tenant_id is not null and contact.routing_active
)
update public.whatsapp_contacts as contact
set routing_active = false,
    consent_state = 'opted_out',
    essential_enabled = false,
    reminders_enabled = false,
    weekly_report_enabled = false,
    updated_at = pg_catalog.now()
from ranked_contacts as ranked
where contact.id = ranked.id and ranked.routing_rank > 1;

with ranked_contacts as (
  select contact.id,
    pg_catalog.row_number() over (
      partition by contact.organization_id, contact.membership_id
      order by contact.activated_at desc nulls last,
        contact.updated_at desc, contact.created_at desc, contact.id desc
    ) as routing_rank
  from public.whatsapp_contacts as contact
  where contact.membership_id is not null and contact.routing_active
)
update public.whatsapp_contacts as contact
set routing_active = false,
    consent_state = 'opted_out',
    essential_enabled = false,
    reminders_enabled = false,
    weekly_report_enabled = false,
    updated_at = pg_catalog.now()
from ranked_contacts as ranked
where contact.id = ranked.id and ranked.routing_rank > 1;

alter table public.whatsapp_contacts
  drop constraint if exists whatsapp_contacts_organization_id_phone_e164_role_key;

create unique index if not exists whatsapp_contacts_active_phone_role_uq
  on public.whatsapp_contacts(organization_id, phone_e164, role)
  where routing_active;

create unique index if not exists whatsapp_contacts_active_tenant_uq
  on public.whatsapp_contacts(organization_id, tenant_id)
  where routing_active and tenant_id is not null;

create unique index if not exists whatsapp_contacts_active_membership_uq
  on public.whatsapp_contacts(organization_id, membership_id)
  where routing_active and membership_id is not null;

create table if not exists public.pgflow_release_sentinels (
  key text primary key,
  applied_at timestamptz not null default pg_catalog.now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.pgflow_release_sentinels enable row level security;
revoke all on table public.pgflow_release_sentinels from public, anon, authenticated;
grant select on table public.pgflow_release_sentinels to service_role;

insert into public.pgflow_release_sentinels (key, metadata)
values (
  'production_whatsapp_runtime_v1',
  pg_catalog.jsonb_build_object('migration', '0044')
)
on conflict (key) do update
set applied_at = excluded.applied_at,
    metadata = excluded.metadata;

create or replace function public.activate_whatsapp_contact(
  p_connection_id uuid,
  p_sender_phone text,
  p_token_hash text,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $activate_whatsapp_contact$
declare
  v_token public.whatsapp_activation_tokens;
  v_contact public.whatsapp_contacts;
  v_deduplicated boolean := false;
begin
  if p_sender_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_token_hash !~ '^[a-f0-9]{64}$'
    or pg_catalog.btrim(coalesce(p_provider_wamid, '')) = ''
  then
    return pg_catalog.jsonb_build_object('activated', false);
  end if;

  select token.* into v_token
  from public.whatsapp_activation_tokens as token
  join public.whatsapp_contacts as contact
    on contact.id = token.contact_id
    and contact.organization_id = token.organization_id
  where token.token_hash = p_token_hash
    and contact.connection_id = p_connection_id
    and contact.phone_e164 = p_sender_phone
    and contact.routing_active
  for update of token;

  if not found then
    return pg_catalog.jsonb_build_object('activated', false);
  end if;

  select contact.* into v_contact
  from public.whatsapp_contacts as contact
  where contact.id = v_token.contact_id
    and contact.organization_id = v_token.organization_id
  for update;

  if v_token.used_at is not null then
    if not exists (
      select 1
      from public.whatsapp_consent_events as consent
      where consent.contact_id = v_contact.id
        and consent.organization_id = v_contact.organization_id
        and consent.event = 'opt_in'
        and consent.source = 'activation_link'
        and consent.provider_wamid = p_provider_wamid
    ) then
      return pg_catalog.jsonb_build_object('activated', false);
    end if;
    v_deduplicated := true;
  elsif v_token.expires_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('activated', false);
  else
    update public.whatsapp_activation_tokens
    set used_at = pg_catalog.now()
    where id = v_token.id;

    update public.whatsapp_contacts
    set consent_state = 'opted_in',
        essential_enabled = true,
        reminders_enabled = case when role = 'resident' then true else reminders_enabled end,
        activated_at = coalesce(activated_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    where id = v_contact.id;

    insert into public.whatsapp_consent_events (
      organization_id, contact_id, event, source, policy_version,
      value, provider_wamid
    ) values (
      v_contact.organization_id, v_contact.id, 'opt_in', 'activation_link',
      v_token.policy_version,
      pg_catalog.jsonb_build_object('policyVersion', v_token.policy_version),
      p_provider_wamid
    )
    on conflict (contact_id, provider_wamid, event) do nothing;

    perform public.enqueue_whatsapp_intent(
      v_contact.organization_id,
      v_contact.connection_id,
      v_contact.id,
      'welcome_consent',
      v_contact.language_code,
      'welcome:' || v_contact.id::text || ':' || v_token.policy_version,
      pg_catalog.jsonb_build_object(
        'kind', 'welcome_consent',
        'contactId', v_contact.id,
        'policyVersion', v_token.policy_version
      ),
      pg_catalog.now() + interval '1 day'
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'activated', true,
    'organizationId', v_contact.organization_id,
    'contactId', v_contact.id,
    'languageCode', v_contact.language_code,
    'role', v_contact.role,
    'policyVersion', v_token.policy_version,
    'deduplicated', v_deduplicated
  );
end
$activate_whatsapp_contact$;

revoke all on function public.activate_whatsapp_contact(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.activate_whatsapp_contact(uuid,text,text,text)
  to service_role;

create or replace function public.enqueue_resident_proof_received_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $enqueue_resident_proof_received$
declare
  v_contact public.whatsapp_contacts;
begin
  if new.state <> 'pending_review' then
    return new;
  end if;

  select contact.* into v_contact
  from public.whatsapp_contacts as contact
  where contact.organization_id = new.organization_id
    and contact.tenant_id = new.tenant_id
    and contact.role = 'resident'
    and contact.routing_active
    and (
      contact.consent_state = 'opted_in'
      or (contact.consent_state = 'opted_out' and contact.essential_enabled)
    )
  order by contact.activated_at desc nulls last, contact.created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  perform public.enqueue_whatsapp_intent(
    new.organization_id,
    v_contact.connection_id,
    v_contact.id,
    'proof_received',
    v_contact.language_code,
    'payment:' || new.id::text || ':proof-received',
    pg_catalog.jsonb_build_object('kind', 'proof_received', 'paymentId', new.id),
    pg_catalog.now() + interval '7 days'
  );

  return new;
end
$enqueue_resident_proof_received$;

revoke all on function public.enqueue_resident_proof_received_on_insert()
  from public, anon, authenticated;
grant execute on function public.enqueue_resident_proof_received_on_insert()
  to service_role;

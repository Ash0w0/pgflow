alter table public.whatsapp_conversations
  drop constraint whatsapp_conversations_state_check,
  add constraint whatsapp_conversations_state_check check (state in (
    'active', 'awaiting_pg', 'awaiting_invoice', 'awaiting_utr', 'awaiting_payment_date',
    'awaiting_issue_category', 'awaiting_issue_description', 'awaiting_moveout_date',
    'resolved', 'operator_review'
  ));

create table public.move_out_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_id uuid not null,
  requested_exit_date date not null,
  state text not null default 'requested'
    check (state in ('requested', 'acknowledged', 'settlement_ready', 'completed', 'cancelled')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'app')),
  provider_wamid text unique,
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, id),
  foreign key (organization_id, tenant_id)
    references public.tenant_profiles(organization_id, id) on delete restrict
);
alter table public.move_out_requests enable row level security;
revoke all on public.move_out_requests from public, anon, authenticated;
grant select, insert, update on public.move_out_requests to service_role;

create or replace function public.create_whatsapp_maintenance_ticket(
  p_contact_id uuid,
  p_category text,
  p_description text,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_tenant public.tenant_profiles;
  v_room text := 'Unassigned';
  v_ticket_id uuid;
begin
  if p_category not in ('wifi','plumbing','electrical','cleaning','food','other')
    or pg_catalog.length(pg_catalog.btrim(p_description)) not between 3 and 1000
  then raise exception using errcode='22023', message='Maintenance details are invalid.'; end if;
  select * into strict v_contact from public.whatsapp_contacts
  where id=p_contact_id and role='resident' and consent_state='opted_in';
  select * into strict v_tenant from public.tenant_profiles
  where id=v_contact.tenant_id and organization_id=v_contact.organization_id and state in ('active','notice');
  select room.code into v_room
  from public.occupancies occupancy
  join public.beds bed on bed.organization_id=occupancy.organization_id and bed.id=occupancy.bed_id
  join public.rooms room on room.organization_id=bed.organization_id and room.id=bed.room_id
  where occupancy.organization_id=v_contact.organization_id and occupancy.tenant_id=v_tenant.id
    and occupancy.state in ('active','notice') limit 1;
  insert into public.maintenance_tickets(
    organization_id,resident_id,room_number,category,title,description,status,priority
  ) values (
    v_contact.organization_id,v_tenant.id,pg_catalog.coalesce(v_room,'Unassigned'),p_category,
    pg_catalog.initcap(p_category)||' issue',pg_catalog.left(pg_catalog.btrim(p_description),1000),
    'open','medium'
  ) returning id into v_ticket_id;
  insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
  values(v_contact.organization_id,null,'system','whatsapp.maintenance_created','maintenance_ticket',v_ticket_id::text,
    pg_catalog.jsonb_build_object('channel','whatsapp','contactId',v_contact.id,'providerWamid',p_provider_wamid));
  return pg_catalog.jsonb_build_object('ticketId',v_ticket_id,'status','open');
end
$$;

create or replace function public.create_whatsapp_move_out_request(
  p_contact_id uuid,
  p_exit_date date,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_request_id uuid;
begin
  if p_exit_date < pg_catalog.current_date or p_exit_date > pg_catalog.current_date + 365
  then raise exception using errcode='22023', message='Move-out date is invalid.'; end if;
  select * into strict v_contact from public.whatsapp_contacts
  where id=p_contact_id and role='resident' and consent_state='opted_in';
  insert into public.move_out_requests(organization_id,tenant_id,requested_exit_date,provider_wamid)
  values(v_contact.organization_id,v_contact.tenant_id,p_exit_date,p_provider_wamid)
  on conflict(provider_wamid) do update set provider_wamid=excluded.provider_wamid
  returning id into v_request_id;
  insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
  values(v_contact.organization_id,null,'system','whatsapp.move_out_requested','move_out_request',v_request_id::text,
    pg_catalog.jsonb_build_object('channel','whatsapp','contactId',v_contact.id,'requestedExitDate',p_exit_date));
  return pg_catalog.jsonb_build_object('requestId',v_request_id,'state','requested');
end
$$;

revoke all on function public.create_whatsapp_maintenance_ticket(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.create_whatsapp_move_out_request(uuid,date,text) from public, anon, authenticated;
grant execute on function public.create_whatsapp_maintenance_ticket(uuid,text,text,text) to service_role;
grant execute on function public.create_whatsapp_move_out_request(uuid,date,text) to service_role;

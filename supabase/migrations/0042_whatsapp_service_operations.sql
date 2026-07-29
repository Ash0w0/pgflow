-- Complete maintenance and move-out owner/resident WhatsApp operations.

alter table public.maintenance_tickets
  add column if not exists source_provider_wamid text;
create unique index if not exists maintenance_tickets_source_wamid_uq
  on public.maintenance_tickets(source_provider_wamid);

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
  if pg_catalog.btrim(coalesce(p_provider_wamid, '')) = ''
    or p_category not in ('wifi','plumbing','electrical','cleaning','food','other')
    or pg_catalog.length(pg_catalog.btrim(p_description)) not between 3 and 1000
  then raise exception using errcode='22023', message='Maintenance details are invalid.'; end if;
  select * into strict v_contact from public.whatsapp_contacts
  where id=p_contact_id and role='resident' and consent_state='opted_in';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('whatsapp-maintenance:' || p_provider_wamid, 0)
  );
  select id into v_ticket_id
  from public.maintenance_tickets
  where source_provider_wamid = p_provider_wamid;
  if found then
    return pg_catalog.jsonb_build_object('ticketId',v_ticket_id,'status','open','deduplicated',true);
  end if;
  select * into strict v_tenant from public.tenant_profiles
  where id=v_contact.tenant_id and organization_id=v_contact.organization_id and state in ('active','notice');
  select room.code into v_room
  from public.occupancies occupancy
  join public.beds bed on bed.organization_id=occupancy.organization_id and bed.id=occupancy.bed_id
  join public.rooms room on room.organization_id=bed.organization_id and room.id=bed.room_id
  where occupancy.organization_id=v_contact.organization_id and occupancy.tenant_id=v_tenant.id
    and occupancy.state in ('active','notice') limit 1;
  insert into public.maintenance_tickets(
    organization_id,resident_id,room_number,category,title,description,status,priority,
    source_provider_wamid
  ) values (
    v_contact.organization_id,v_tenant.id,coalesce(v_room,'Unassigned'),p_category,
    pg_catalog.initcap(p_category)||' issue',pg_catalog.left(pg_catalog.btrim(p_description),1000),
    'open','medium',p_provider_wamid
  )
  on conflict (source_provider_wamid) do update
    set source_provider_wamid = excluded.source_provider_wamid
  returning id into v_ticket_id;
  insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
  values(v_contact.organization_id,null,'system','whatsapp.maintenance_created','maintenance_ticket',v_ticket_id::text,
    pg_catalog.jsonb_build_object('channel','whatsapp','contactId',v_contact.id,'providerWamid',p_provider_wamid));
  return pg_catalog.jsonb_build_object('ticketId',v_ticket_id,'status','open','deduplicated',false);
end
$$;

create or replace function public.enqueue_maintenance_owner_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_property_id uuid;
begin
  select property_id into v_property_id
  from public.tenant_profiles
  where organization_id = new.organization_id and id = new.resident_id;
  select contact.* into v_contact
  from public.whatsapp_contacts contact
  join public.memberships membership
    on membership.organization_id = contact.organization_id
   and membership.id = contact.membership_id
  where contact.organization_id = new.organization_id
    and contact.consent_state = 'opted_in'
    and membership.property_id = v_property_id
    and membership.role in ('owner','manager')
    and membership.state = 'active'
  order by case membership.role when 'owner' then 0 else 1 end, contact.created_at
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id, v_contact.connection_id, v_contact.id,
    'maintenance_created', v_contact.language_code,
    'maintenance:' || new.id::text || ':created',
    pg_catalog.jsonb_build_object('kind','maintenance_created','ticketId',new.id),
    pg_catalog.now() + interval '7 days'
  );
  return new;
end
$$;

drop trigger if exists maintenance_enqueue_owner_alert on public.maintenance_tickets;
create trigger maintenance_enqueue_owner_alert
after insert on public.maintenance_tickets
for each row execute function public.enqueue_maintenance_owner_alert();

create or replace function public.enqueue_maintenance_resident_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  if old.status = new.status then return new; end if;
  select * into v_contact
  from public.whatsapp_contacts
  where organization_id = new.organization_id
    and tenant_id = new.resident_id
    and role = 'resident'
    and (
      consent_state = 'opted_in'
      or (consent_state = 'opted_out' and essential_enabled)
    )
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id, v_contact.connection_id, v_contact.id,
    'maintenance_update', v_contact.language_code,
    'maintenance:' || new.id::text || ':' || new.status,
    pg_catalog.jsonb_build_object(
      'kind','maintenance_update','ticketId',new.id,'event',new.status
    ),
    pg_catalog.now() + interval '7 days'
  );
  return new;
end
$$;

drop trigger if exists maintenance_enqueue_resident_update on public.maintenance_tickets;
create trigger maintenance_enqueue_resident_update
after update of status on public.maintenance_tickets
for each row execute function public.enqueue_maintenance_resident_update();

create or replace function public.update_whatsapp_maintenance_ticket(
  p_contact_id uuid,
  p_ticket_id uuid,
  p_status text,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_membership public.memberships;
  v_ticket public.maintenance_tickets;
  v_property_id uuid;
begin
  if p_status not in ('in_progress','resolved') then
    raise exception using errcode='22023', message='Maintenance status is invalid.';
  end if;
  select * into strict v_contact
  from public.whatsapp_contacts
  where id=p_contact_id and role in ('owner','manager') and consent_state='opted_in';
  select * into strict v_membership
  from public.memberships
  where id=v_contact.membership_id and organization_id=v_contact.organization_id
    and auth_user_id is not null and role in ('owner','manager') and state='active';
  select * into strict v_ticket
  from public.maintenance_tickets
  where id=p_ticket_id and organization_id=v_contact.organization_id
  for update;
  select property_id into strict v_property_id
  from public.tenant_profiles
  where organization_id=v_contact.organization_id and id=v_ticket.resident_id;
  if v_membership.property_id <> v_property_id then
    raise exception using errcode='42501', message='Ticket is outside this owner property.';
  end if;
  if v_ticket.status in ('resolved','closed') then
    return pg_catalog.jsonb_build_object('ticketId',v_ticket.id,'status',v_ticket.status,'deduplicated',true);
  end if;
  update public.maintenance_tickets
  set status=p_status,updated_at=pg_catalog.now()
  where id=v_ticket.id;
  insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
  values(v_contact.organization_id,v_membership.auth_user_id,'user','whatsapp.maintenance_'||p_status,
    'maintenance_ticket',v_ticket.id::text,
    pg_catalog.jsonb_build_object('contactId',v_contact.id,'providerWamid',p_provider_wamid));
  return pg_catalog.jsonb_build_object('ticketId',v_ticket.id,'status',p_status,'deduplicated',false);
end
$$;

alter table public.move_out_requests
  add column if not exists property_id uuid,
  add column if not exists settlement_id uuid references public.resident_moveouts(id) on delete restrict;

update public.move_out_requests request
set property_id = tenant.property_id
from public.tenant_profiles tenant
where tenant.organization_id = request.organization_id
  and tenant.id = request.tenant_id
  and request.property_id is null;

alter table public.move_out_requests
  alter column property_id set not null,
  add constraint move_out_requests_org_property_fk
    foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict;

create unique index if not exists move_out_requests_one_live_per_tenant_uq
  on public.move_out_requests(organization_id, tenant_id)
  where state in ('requested','acknowledged','settlement_ready');

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
  v_request public.move_out_requests;
  v_property_id uuid;
begin
  if pg_catalog.btrim(coalesce(p_provider_wamid, '')) = ''
    or p_exit_date < pg_catalog.current_date or p_exit_date > pg_catalog.current_date + 365
  then raise exception using errcode='22023', message='Move-out date is invalid.'; end if;
  select * into strict v_contact from public.whatsapp_contacts
  where id=p_contact_id and role='resident' and consent_state='opted_in';
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'whatsapp-moveout:' || v_contact.organization_id::text || ':' || v_contact.tenant_id::text,
      0
    )
  );
  select * into v_request from public.move_out_requests
  where provider_wamid=p_provider_wamid;
  if found then
    return pg_catalog.jsonb_build_object('requestId',v_request.id,'state',v_request.state,'deduplicated',true);
  end if;
  select property_id into strict v_property_id
  from public.tenant_profiles
  where organization_id=v_contact.organization_id and id=v_contact.tenant_id;
  select * into v_request from public.move_out_requests
  where organization_id=v_contact.organization_id and tenant_id=v_contact.tenant_id
    and state in ('requested','acknowledged','settlement_ready')
  for update;
  if found then
    return pg_catalog.jsonb_build_object('requestId',v_request.id,'state',v_request.state,'deduplicated',true);
  end if;
  insert into public.move_out_requests(
    organization_id,property_id,tenant_id,requested_exit_date,provider_wamid
  ) values(
    v_contact.organization_id,v_property_id,v_contact.tenant_id,p_exit_date,p_provider_wamid
  ) returning * into v_request;
  insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
  values(v_contact.organization_id,null,'system','whatsapp.move_out_requested','move_out_request',v_request.id::text,
    pg_catalog.jsonb_build_object('channel','whatsapp','contactId',v_contact.id,'requestedExitDate',p_exit_date));
  return pg_catalog.jsonb_build_object('requestId',v_request.id,'state','requested','deduplicated',false);
end
$$;

create or replace function public.enqueue_move_out_owner_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  select contact.* into v_contact
  from public.whatsapp_contacts contact
  join public.memberships membership
    on membership.organization_id=contact.organization_id and membership.id=contact.membership_id
  where contact.organization_id=new.organization_id
    and contact.consent_state='opted_in'
    and membership.property_id=new.property_id
    and membership.role in ('owner','manager')
    and membership.state='active'
  order by case membership.role when 'owner' then 0 else 1 end,contact.created_at
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id,v_contact.connection_id,v_contact.id,
    'move_out_request',v_contact.language_code,
    'moveout:'||new.id::text||':requested',
    pg_catalog.jsonb_build_object('kind','move_out_request','requestId',new.id),
    pg_catalog.now()+interval '14 days'
  );
  return new;
end
$$;

drop trigger if exists move_out_enqueue_owner_alert on public.move_out_requests;
create trigger move_out_enqueue_owner_alert
after insert on public.move_out_requests
for each row execute function public.enqueue_move_out_owner_alert();

create or replace function public.enqueue_move_out_resident_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
begin
  if old.state=new.state then return new; end if;
  select * into v_contact from public.whatsapp_contacts
  where organization_id=new.organization_id and tenant_id=new.tenant_id
    and role='resident'
    and (
      consent_state='opted_in'
      or (consent_state='opted_out' and essential_enabled)
    )
  limit 1;
  if not found then return new; end if;
  perform public.enqueue_whatsapp_intent(
    new.organization_id,v_contact.connection_id,v_contact.id,
    'move_out_update',v_contact.language_code,
    'moveout:'||new.id::text||':'||new.state,
    pg_catalog.jsonb_build_object('kind','move_out_update','requestId',new.id,'event',new.state),
    pg_catalog.now()+interval '14 days'
  );
  return new;
end
$$;

drop trigger if exists move_out_enqueue_resident_update on public.move_out_requests;
create trigger move_out_enqueue_resident_update
after update of state on public.move_out_requests
for each row execute function public.enqueue_move_out_resident_update();

create or replace function public.acknowledge_whatsapp_move_out_request(
  p_contact_id uuid,
  p_request_id uuid,
  p_provider_wamid text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.whatsapp_contacts;
  v_membership public.memberships;
  v_request public.move_out_requests;
begin
  select * into strict v_contact from public.whatsapp_contacts
  where id=p_contact_id and role in ('owner','manager') and consent_state='opted_in';
  select * into strict v_membership from public.memberships
  where id=v_contact.membership_id and organization_id=v_contact.organization_id
    and auth_user_id is not null and role in ('owner','manager') and state='active';
  select * into strict v_request from public.move_out_requests
  where id=p_request_id and organization_id=v_contact.organization_id for update;
  if v_membership.property_id<>v_request.property_id then
    raise exception using errcode='42501', message='Move-out request is outside this owner property.';
  end if;
  if v_request.state='requested' then
    update public.move_out_requests
    set state='acknowledged',acknowledged_by=v_membership.auth_user_id,
      acknowledged_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=v_request.id;
    insert into public.audit_events(organization_id,actor_id,actor_kind,action,entity_type,entity_id,after_data)
    values(v_request.organization_id,v_membership.auth_user_id,'user','whatsapp.move_out_acknowledged',
      'move_out_request',v_request.id::text,
      pg_catalog.jsonb_build_object('contactId',v_contact.id,'providerWamid',p_provider_wamid));
  end if;
  return pg_catalog.jsonb_build_object('requestId',v_request.id,'state','acknowledged');
end
$$;

create or replace function public.complete_move_out_request_from_settlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.move_out_requests
  set state='completed',settlement_id=new.id,updated_at=pg_catalog.now()
  where id=(
    select request.id from public.move_out_requests request
    where request.organization_id=new.organization_id
      and request.tenant_id=new.resident_id
      and request.state in ('requested','acknowledged','settlement_ready')
    order by request.created_at
    limit 1
    for update
  );
  return new;
end
$$;

drop trigger if exists resident_moveouts_complete_request on public.resident_moveouts;
create trigger resident_moveouts_complete_request
after insert on public.resident_moveouts
for each row execute function public.complete_move_out_request_from_settlement();

revoke all on function public.update_whatsapp_maintenance_ticket(uuid,uuid,text,text)
  from public,anon,authenticated;
revoke all on function public.acknowledge_whatsapp_move_out_request(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.update_whatsapp_maintenance_ticket(uuid,uuid,text,text)
  to service_role;
grant execute on function public.acknowledge_whatsapp_move_out_request(uuid,uuid,text)
  to service_role;

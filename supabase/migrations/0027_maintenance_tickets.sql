-- Create table for tenant maintenance complaints & tickets
create table if not exists public.maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resident_id uuid references public.tenant_profiles(id) on delete set null,
  room_number text not null,
  category text not null check (category in ('wifi', 'plumbing', 'electrical', 'cleaning', 'food', 'other')),
  title text not null,
  description text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_staff_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index if not exists maintenance_tickets_org_status_idx
  on public.maintenance_tickets (organization_id, status, created_at desc);

create index if not exists maintenance_tickets_resident_idx
  on public.maintenance_tickets (resident_id);

alter table public.maintenance_tickets enable row level security;
revoke all on public.maintenance_tickets from public, anon, authenticated, service_role;
grant select on public.maintenance_tickets to service_role;

-- RPC function to create a new maintenance ticket
create or replace function public.create_maintenance_ticket(
  p_actor_id uuid,
  p_organization_id uuid,
  p_resident_id uuid,
  p_room_number text,
  p_category text,
  p_title text,
  p_description text default null,
  p_priority text default 'medium'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ticket_id uuid;
begin
  if p_actor_id is null
    or p_organization_id is null
    or pg_catalog.btrim(p_room_number) = ''
    or pg_catalog.btrim(p_category) = ''
    or pg_catalog.btrim(p_title) = ''
  then
    raise exception using errcode = '22023', message = 'Missing required ticket information.';
  end if;

  insert into public.maintenance_tickets (
    organization_id,
    resident_id,
    room_number,
    category,
    title,
    description,
    status,
    priority,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    p_resident_id,
    pg_catalog.btrim(p_room_number),
    pg_catalog.btrim(p_category),
    pg_catalog.btrim(p_title),
    p_description,
    'open',
    pg_catalog.coalesce(p_priority, 'medium'),
    v_now,
    v_now
  ) returning id into v_ticket_id;

  -- Audit log
  insert into public.audit_events (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) values (
    p_organization_id,
    p_actor_id,
    'maintenance_ticket.created',
    'maintenance_ticket',
    v_ticket_id::text,
    pg_catalog.jsonb_build_object(
      'ticketId', v_ticket_id,
      'roomNumber', p_room_number,
      'category', p_category,
      'title', p_title,
      'priority', p_priority
    )
  );

  return pg_catalog.jsonb_build_object(
    'ticketId', v_ticket_id,
    'organizationId', p_organization_id,
    'status', 'open'
  );
end;
$function$;

-- RPC function to update ticket status
create or replace function public.update_maintenance_ticket_status(
  p_actor_id uuid,
  p_organization_id uuid,
  p_ticket_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_actor_id is null
    or p_organization_id is null
    or p_ticket_id is null
    or p_status not in ('open', 'in_progress', 'resolved', 'closed')
  then
    raise exception using errcode = '22023', message = 'Invalid maintenance ticket status parameter.';
  end if;

  update public.maintenance_tickets
  set status = p_status,
      updated_at = v_now
  where id = p_ticket_id
    and organization_id = p_organization_id;

  if not found then
    raise exception using errcode = '42501', message = 'Ticket not found or access denied.';
  end if;

  return pg_catalog.jsonb_build_object(
    'ticketId', p_ticket_id,
    'status', p_status,
    'updatedAt', v_now
  );
end;
$function$;

revoke all on function public.create_maintenance_ticket(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_maintenance_ticket(uuid, uuid, uuid, text, text, text, text, text)
  to service_role;

revoke all on function public.update_maintenance_ticket_status(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_maintenance_ticket_status(uuid, uuid, uuid, text)
  to service_role;

comment on table public.maintenance_tickets is
  'Tenant maintenance complaints and resolution tracking for PGFlow.';

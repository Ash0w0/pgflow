alter table public.properties
  add column if not exists upi_note_prefix text not null default 'RENT';

alter table public.payments
  add column if not exists invoice_id uuid,
  add column if not exists note text not null default '';

alter table public.payments
  add constraint payments_invoice_fkey
  foreign key (organization_id, invoice_id)
  references public.invoices(organization_id, id) on delete restrict;

create table public.payment_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, payment_id, invoice_id),
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict,
  foreign key (organization_id, invoice_id) references public.invoices(organization_id, id) on delete restrict
);

create table public.receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null,
  payment_id uuid not null,
  invoice_id uuid not null,
  tenant_id uuid not null,
  number text not null,
  amount bigint not null check (amount > 0),
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default pg_catalog.now(),
  unique (organization_id, number),
  unique (organization_id, payment_id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict,
  foreign key (organization_id, invoice_id) references public.invoices(organization_id, id) on delete restrict,
  foreign key (organization_id, tenant_id) references public.tenant_profiles(organization_id, id) on delete restrict
);

alter table public.payment_allocations enable row level security;
alter table public.receipts enable row level security;

create policy payment_allocations_scoped_select on public.payment_allocations for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or exists (select 1 from public.payments where id = payment_id and organization_id = payment_allocations.organization_id and public.is_own_tenant(organization_id, tenant_id))
);
create policy receipts_scoped_select on public.receipts for select to authenticated
using (
  public.has_org_role(organization_id, array['owner','manager','accountant']::public.membership_role[])
  or public.is_own_tenant(organization_id, tenant_id)
);

create or replace function public.update_property_upi(
  p_actor_user_id uuid, p_organization_id uuid, p_property_id uuid,
  p_upi_id text, p_payee_name text, p_note_prefix text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_upi text := pg_catalog.lower(pg_catalog.btrim(p_upi_id)); v_payee text := pg_catalog.btrim(p_payee_name); v_prefix text := pg_catalog.upper(pg_catalog.btrim(p_note_prefix));
begin
  if not exists (select 1 from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id and property_id=p_property_id and role='owner' and state='active') then
    raise exception using errcode='42501', message='Active property-owner access is required.';
  end if;
  if v_upi !~ '^[a-z0-9._-]{2,100}@[a-z0-9.-]{2,64}$' or pg_catalog.length(v_payee) not between 2 and 120 or v_prefix !~ '^[A-Z0-9-]{2,20}$' then
    raise exception using errcode='22023', message='Enter a valid UPI ID, payee name and note prefix.';
  end if;
  update public.properties set upi_id=v_upi, upi_payee_name=v_payee, upi_note_prefix=v_prefix, updated_at=pg_catalog.now()
  where organization_id=p_organization_id and id=p_property_id;
  if not found then raise exception using errcode='P0001', message='Property not found.'; end if;
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,p_actor_user_id,'property.upi_updated','property',p_property_id::text,pg_catalog.jsonb_build_object('payeeName',v_payee,'notePrefix',v_prefix,'upiConfigured',true));
  return pg_catalog.jsonb_build_object('configured',true,'payeeName',v_payee,'notePrefix',v_prefix);
end $$;

create or replace function public.submit_upi_payment_evidence(
  p_actor_user_id uuid, p_organization_id uuid, p_property_id uuid, p_invoice_id uuid,
  p_amount bigint, p_reference text, p_paid_at timestamptz,
  p_object_key text, p_content_type text, p_file_hash text, p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_payment_id uuid := extensions.gen_random_uuid(); v_reference text := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p_reference),'[^A-Za-z0-9]','','g')); v_tenant_id uuid; v_role public.membership_role;
begin
  select role into v_role from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id and property_id=p_property_id and state='active';
  if v_role is null or v_role not in ('owner','manager','accountant','tenant') then raise exception using errcode='42501', message='An active PG account is required.'; end if;
  select * into v_invoice from public.invoices where organization_id=p_organization_id and property_id=p_property_id and id=p_invoice_id for update;
  if not found or v_invoice.state not in ('issued','partially_paid','overdue') then raise exception using errcode='P0001', message='This invoice cannot accept payment evidence.'; end if;
  if v_role='tenant' then
    select id into v_tenant_id from public.tenant_profiles where organization_id=p_organization_id and property_id=p_property_id and membership_id=(select id from public.memberships where auth_user_id=p_actor_user_id and organization_id=p_organization_id) and state='active';
    if v_tenant_id is null or v_tenant_id<>v_invoice.tenant_id then raise exception using errcode='42501', message='This invoice does not belong to the tenant.'; end if;
  end if;
  if p_amount<=0 or p_amount>(v_invoice.total_amount-v_invoice.paid_amount) then raise exception using errcode='22023', message='Amount must not exceed the outstanding balance.'; end if;
  if v_reference !~ '^[A-Z0-9]{6,35}$' or p_paid_at < pg_catalog.now()-interval '90 days' or p_paid_at > pg_catalog.now()+interval '1 day' then raise exception using errcode='22023', message='Payment reference or date is invalid.'; end if;
  if p_file_hash !~ '^[a-f0-9]{64}$' or p_content_type not in ('image/jpeg','image/png','image/webp') or p_object_key !~ ('^organizations/'||p_organization_id::text||'/payment-evidence/[^/]+$') then raise exception using errcode='22023', message='Screenshot evidence is invalid.'; end if;
  insert into public.payments(id,organization_id,property_id,tenant_id,invoice_id,method,amount,reference,state,paid_at,submitted_by,note)
  values(v_payment_id,p_organization_id,p_property_id,v_invoice.tenant_id,p_invoice_id,'upi',p_amount,v_reference,'pending_review',p_paid_at,p_actor_user_id,pg_catalog.left(pg_catalog.btrim(p_note),500));
  insert into public.payment_evidence(organization_id,payment_id,object_key,content_type,file_hash) values(p_organization_id,v_payment_id,p_object_key,p_content_type,p_file_hash);
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'payment.upi_submitted','payment',v_payment_id::text,pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'amount',p_amount,'state','pending_review'));
  return pg_catalog.jsonb_build_object('paymentId',v_payment_id,'state','pending_review','autoApproved',false);
end $$;

create or replace function public.review_payment(
  p_actor_user_id uuid, p_organization_id uuid, p_property_id uuid,
  p_payment_id uuid, p_decision text, p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments; v_invoice public.invoices; v_receipt_id uuid; v_receipt_number text;
begin
  if p_decision not in ('approve','reject') then raise exception using errcode='22023', message='Decision is invalid.'; end if;
  select * into v_payment from public.payments where organization_id=p_organization_id and property_id=p_property_id and id=p_payment_id for update;
  if not found or v_payment.state<>'pending_review' then raise exception using errcode='P0001', message='This payment is no longer pending review.'; end if;
  if not exists (
    select 1 from public.memberships membership
    join public.properties property on property.organization_id=membership.organization_id and property.id=membership.property_id
    where membership.auth_user_id=p_actor_user_id and membership.organization_id=p_organization_id and membership.property_id=p_property_id and membership.state='active'
      and (membership.role in ('owner','accountant') or (membership.role='manager' and v_payment.method='cash' and not property.require_cash_approval and v_payment.submitted_by=p_actor_user_id))
  ) then raise exception using errcode='42501', message='Owner or accountant approval is required.'; end if;
  if p_decision='reject' then
    if pg_catalog.btrim(coalesce(p_reason,''))='' then raise exception using errcode='22023', message='Rejection reason is required.'; end if;
    update public.payments set state='rejected',rejection_reason=pg_catalog.left(pg_catalog.btrim(p_reason),250),updated_at=pg_catalog.now() where id=v_payment.id;
    insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'payment.rejected','payment',v_payment.id::text,pg_catalog.jsonb_build_object('reason',pg_catalog.left(pg_catalog.btrim(p_reason),250)));
    return pg_catalog.jsonb_build_object('paymentId',v_payment.id,'state','rejected','receiptIssued',false);
  end if;
  select * into v_invoice from public.invoices where organization_id=p_organization_id and property_id=p_property_id and id=v_payment.invoice_id for update;
  if not found or v_payment.amount>(v_invoice.total_amount-v_invoice.paid_amount) then raise exception using errcode='P0001', message='Payment exceeds the current invoice balance.'; end if;
  update public.payments set state='approved',approved_by=p_actor_user_id,approved_at=pg_catalog.now(),updated_at=pg_catalog.now() where id=v_payment.id;
  insert into public.payment_allocations(organization_id,payment_id,invoice_id,amount) values(p_organization_id,v_payment.id,v_invoice.id,v_payment.amount);
  update public.invoices set paid_amount=paid_amount+v_payment.amount,state=case when paid_amount+v_payment.amount=total_amount then 'paid' else 'partially_paid' end,updated_at=pg_catalog.now() where id=v_invoice.id;
  v_receipt_id:=extensions.gen_random_uuid(); v_receipt_number:='RCP-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMM')||'-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_receipt_id::text,'-',''),1,8));
  insert into public.receipts(id,organization_id,property_id,payment_id,invoice_id,tenant_id,number,amount,issued_by) values(v_receipt_id,p_organization_id,p_property_id,v_payment.id,v_invoice.id,v_payment.tenant_id,v_receipt_number,v_payment.amount,p_actor_user_id);
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'payment.approved','payment',v_payment.id::text,pg_catalog.jsonb_build_object('invoiceId',v_invoice.id,'amount',v_payment.amount,'receiptId',v_receipt_id));
  return pg_catalog.jsonb_build_object('paymentId',v_payment.id,'state','approved','receiptIssued',true,'receiptNumber',v_receipt_number);
end $$;

create or replace function public.record_cash_payment(
  p_actor_user_id uuid, p_organization_id uuid, p_property_id uuid,
  p_invoice_id uuid, p_amount bigint, p_collected_at timestamptz, p_note text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_role public.membership_role; v_requires_approval boolean; v_invoice public.invoices; v_payment_id uuid:=extensions.gen_random_uuid(); v_review jsonb;
begin
  select membership.role, property.require_cash_approval into v_role,v_requires_approval from public.memberships membership join public.properties property on property.organization_id=membership.organization_id and property.id=membership.property_id where membership.auth_user_id=p_actor_user_id and membership.organization_id=p_organization_id and membership.property_id=p_property_id and membership.role in ('owner','manager','accountant') and membership.state='active';
  if v_role is null then raise exception using errcode='42501', message='Staff access is required.'; end if;
  select * into v_invoice from public.invoices where organization_id=p_organization_id and property_id=p_property_id and id=p_invoice_id for update;
  if not found or v_invoice.state not in ('issued','partially_paid','overdue') or p_amount<=0 or p_amount>(v_invoice.total_amount-v_invoice.paid_amount) then raise exception using errcode='22023', message='Cash amount must not exceed the outstanding balance.'; end if;
  insert into public.payments(id,organization_id,property_id,tenant_id,invoice_id,method,amount,state,paid_at,submitted_by,note) values(v_payment_id,p_organization_id,p_property_id,v_invoice.tenant_id,p_invoice_id,'cash',p_amount,'pending_review',p_collected_at,p_actor_user_id,pg_catalog.left(pg_catalog.btrim(p_note),500));
  insert into public.audit_events(organization_id,actor_id,action,entity_type,entity_id,after_data) values(p_organization_id,p_actor_user_id,'payment.cash_recorded','payment',v_payment_id::text,pg_catalog.jsonb_build_object('invoiceId',p_invoice_id,'amount',p_amount,'receivingStaffId',p_actor_user_id,'state','pending_review'));
  if v_role in ('owner','accountant') or (v_role='manager' and not v_requires_approval) then
    v_review:=public.review_payment(p_actor_user_id,p_organization_id,p_property_id,v_payment_id,'approve',null);
    return v_review||pg_catalog.jsonb_build_object('receivingStaffId',p_actor_user_id,'method','cash');
  end if;
  return pg_catalog.jsonb_build_object('paymentId',v_payment_id,'state','pending_review','receiptIssued',false,'receivingStaffId',p_actor_user_id,'method','cash');
end $$;

revoke all on function public.update_property_upi(uuid,uuid,uuid,text,text,text) from public;
revoke all on function public.submit_upi_payment_evidence(uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,text,text,text) from public;
revoke all on function public.review_payment(uuid,uuid,uuid,uuid,text,text) from public;
revoke all on function public.record_cash_payment(uuid,uuid,uuid,uuid,bigint,timestamptz,text) from public;
grant execute on function public.update_property_upi(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.submit_upi_payment_evidence(uuid,uuid,uuid,uuid,bigint,text,timestamptz,text,text,text,text) to service_role;
grant execute on function public.review_payment(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.record_cash_payment(uuid,uuid,uuid,uuid,bigint,timestamptz,text) to service_role;

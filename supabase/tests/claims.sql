begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, aud, role, email) values
  ('f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'claims-owner@example.test'),
  ('f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'claims-manager@example.test'),
  ('f0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'claims-stranger@example.test');

insert into public.organizations (id, name, slug, template_version_id, state)
values ('ff000000-0000-0000-0000-000000000001', 'Claims PG', 'claims-pg', (select id from public.template_versions where version = '1.0.0'), 'live');
insert into public.properties (id, organization_id, name)
values ('ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-000000000001', 'Claims PG');
insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state) values
  ('ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000001', '+919000003001', 'Claims Owner', 'owner', 'active'),
  ('ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-000000000002', '+919000003002', 'Claims Manager', 'manager', 'active');
insert into public.tenant_profiles (id, organization_id, property_id, full_name, phone)
values ('ff000000-0000-0000-0000-0000000000b1', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'Claims Resident', '+919000003003');
insert into public.payments (id, organization_id, property_id, tenant_id, method, amount, reference, state, paid_at, submitted_by, approved_by, approved_at)
values ('ff000000-0000-0000-0000-0000000000c1', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-0000000000b1',
  'upi', 8000, '412345678901', 'approved', pg_catalog.now(), 'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', pg_catalog.now());

select throws_ok(
  $$select public.raise_payment_claim('f0000000-0000-0000-0000-000000000003', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-0000000000c1', 'UTR not in bank statement')$$,
  '42501', null, 'outsiders cannot raise claims'
);
select is(
  public.raise_payment_claim('f0000000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-0000000000c1', 'UTR not in bank statement') ->> 'state',
  'open', 'a manager can raise a claim on an approved payment'
);
select throws_ok(
  $$select public.raise_payment_claim('f0000000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-0000000000c1', 'Second claim attempt')$$,
  'P0001', null, 'a payment cannot have two open claims'
);
select throws_ok(
  $$select public.resolve_payment_claim('f0000000-0000-0000-0000-000000000002', 'ff000000-0000-0000-0000-000000000001', (select id from public.payment_claims where payment_id = 'ff000000-0000-0000-0000-0000000000c1'), 'uphold', '')$$,
  '42501', null, 'a manager cannot resolve claims'
);
select is(
  public.resolve_payment_claim('f0000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', (select id from public.payment_claims where payment_id = 'ff000000-0000-0000-0000-0000000000c1'), 'uphold', 'Confirmed with bank') ->> 'state',
  'upheld', 'the owner can uphold a claim'
);
select is((select state::text from public.payments where id = 'ff000000-0000-0000-0000-0000000000c1'), 'approved', 'the original payment is never reversed');
select is(
  (select total_amount::integer from public.invoices where id = (select correction_invoice_id from public.payment_claims where payment_id = 'ff000000-0000-0000-0000-0000000000c1')),
  8000, 'upholding issues a correction due for the claimed amount'
);
select ok(
  (select number like 'CORR-%' and state = 'issued' from public.invoices where id = (select correction_invoice_id from public.payment_claims where payment_id = 'ff000000-0000-0000-0000-0000000000c1')),
  'the correction due is a separately numbered, payable invoice'
);
select throws_ok(
  $$select public.raise_payment_claim('f0000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-000000000001', 'ff000000-0000-0000-0000-0000000000a1', 'ff000000-0000-0000-0000-0000000000c1', 'Claiming again after correction')$$,
  'P0001', null, 'a corrected payment cannot be claimed again'
);
select is(
  (select pg_catalog.count(*)::integer from public.audit_events where organization_id = 'ff000000-0000-0000-0000-000000000001' and action in ('payment.claim_raised', 'payment.claim_upheld')),
  2, 'raising and upholding are audited'
);
select ok(
  not has_function_privilege('authenticated', 'public.raise_payment_claim(uuid,uuid,uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_payment_claim(uuid,uuid,uuid,text,text)', 'execute')
  and not has_table_privilege('authenticated', 'public.payment_claims', 'insert'),
  'claims can only be written through the server'
);

select * from finish();
rollback;

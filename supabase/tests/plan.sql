begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

insert into auth.users (id, aud, role, email)
values ('e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'plan-operator@example.test');
insert into public.platform_operators (auth_user_id, display_name, state)
values ('e0000000-0000-0000-0000-000000000001', 'Plan Operator', 'active');

insert into public.organizations (id, name, slug, template_version_id, state)
values ('ee000000-0000-0000-0000-000000000001', 'Plan PG', 'plan-pg', (select id from public.template_versions where version = '1.0.0'), 'live');
insert into public.properties (id, organization_id, name)
values ('ee000000-0000-0000-0000-0000000000a1', 'ee000000-0000-0000-0000-000000000001', 'Plan PG');

select ok(
  (select trial_ends_at between pg_catalog.now() + interval '14 days 23 hours' and pg_catalog.now() + interval '15 days 1 hour'
   from public.organizations where id = 'ee000000-0000-0000-0000-000000000001'),
  'new PGs start with a 15-day trial'
);
select is(public.organization_plan_status('ee000000-0000-0000-0000-000000000001'), 'trial', 'a new PG is on trial');
select is((select resident_limit from public.organizations where id = 'ee000000-0000-0000-0000-000000000001'), 100000, 'trial PGs have no resident cap');

select lives_ok(
  $$insert into public.floors (organization_id, property_id, name) values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'Ground')$$,
  'a trial PG can add floors'
);

update public.organizations set trial_ends_at = pg_catalog.now() - interval '1 minute' where id = 'ee000000-0000-0000-0000-000000000001';
select is(public.organization_plan_status('ee000000-0000-0000-0000-000000000001'), 'expired', 'a lapsed trial is expired');

select throws_ok(
  $$insert into public.floors (organization_id, property_id, name) values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'First')$$,
  'P0001',
  'Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.',
  'an expired PG cannot add floors'
);
select throws_ok(
  $$insert into public.rooms (organization_id, property_id, floor_name, code, capacity, default_rent) values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'Ground', 'G-1', 1, 5000)$$,
  'P0001',
  null,
  'an expired PG cannot add rooms'
);
select throws_ok(
  $$insert into public.tenant_profiles (organization_id, property_id, full_name, phone) values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'Late Resident', '+919000001111')$$,
  'P0001',
  null,
  'an expired PG cannot add residents'
);

select throws_ok(
  $$select public.set_organization_plan('e0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'mark_paid', pg_catalog.now() - interval '1 day', '')$$,
  '22023',
  null,
  'paid-until must be in the future'
);

select is(
  public.set_organization_plan('e0000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', 'mark_paid', pg_catalog.now() + interval '30 days', 'UPI received') ->> 'status',
  'paid',
  'an operator can mark a PG as paid'
);
select lives_ok(
  $$insert into public.floors (organization_id, property_id, name) values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'First')$$,
  'a paid PG is writable again'
);
select is(
  (select pg_catalog.count(*)::integer from public.platform_audit_events where entity_id = 'ee000000-0000-0000-0000-000000000001' and action = 'organization.plan_mark_paid'),
  1,
  'plan changes are audited'
);

-- Manager accounts --------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('e0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'plan-owner@example.test'),
  ('e0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'plan-manager@example.test'),
  ('e0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'plan-stranger@example.test');
insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
values ('ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000002', '+919000002001', 'Plan Owner', 'owner', 'active');
update public.organizations set state = 'draft' where id = 'ee000000-0000-0000-0000-000000000001';

select throws_ok(
  $$select public.add_organization_manager('e0000000-0000-0000-0000-000000000004', 'ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000003', 'Mallory', '+919000002002')$$,
  '42501', null, 'only the PG owner can add managers'
);
select is(
  public.add_organization_manager('e0000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-000000000003', 'Meera Manager', '+919000002002') ->> 'state',
  'active', 'the owner can add an active manager'
);
select is((select role::text from public.memberships where auth_user_id = 'e0000000-0000-0000-0000-000000000003'), 'manager', 'the membership has the manager role');
select is((select state::text from public.organizations where id = 'ee000000-0000-0000-0000-000000000001'), 'core_ready', 'adding a manager opens a draft workspace for the team');

select is(
  public.set_organization_manager_state('e0000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000001',
    (select id from public.memberships where auth_user_id = 'e0000000-0000-0000-0000-000000000003'), 'disabled') ->> 'state',
  'disabled', 'the owner can disable a manager'
);
update public.organizations set paid_until = null, trial_ends_at = pg_catalog.now() - interval '1 minute' where id = 'ee000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select public.set_organization_manager_state('e0000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000001',
    (select id from public.memberships where auth_user_id = 'e0000000-0000-0000-0000-000000000003'), 'active')$$,
  'P0001', null, 'an expired PG cannot re-enable managers'
);
select ok(
  not has_function_privilege('authenticated', 'public.add_organization_manager(uuid,uuid,uuid,uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.set_organization_manager_state(uuid,uuid,uuid,text)', 'execute'),
  'manager RPCs are server-only'
);

select * from finish();
rollback;

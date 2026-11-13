begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (id, aud, role, email) values
  ('f1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'access-owner@example.test'),
  ('f1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'access-resident@example.test'),
  ('f1000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'access-outsider@example.test');

insert into public.organizations (id, name, slug, template_version_id, state)
values ('f1100000-0000-0000-0000-000000000001', 'Access PG', 'access-pg', (select id from public.template_versions where version = '1.0.0'), 'live');
insert into public.properties (id, organization_id, name)
values ('f1100000-0000-0000-0000-0000000000a1', 'f1100000-0000-0000-0000-000000000001', 'Access PG');
insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
values ('f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-000000000001', '+919000002001', 'Access Owner', 'owner', 'active');
insert into public.tenant_profiles (id, organization_id, property_id, full_name, phone)
values ('f1200000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'Access Resident', '+919000002002');

select throws_ok(
  $$select public.grant_resident_app_access('f1000000-0000-0000-0000-000000000003', 'f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'f1200000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002')$$,
  '42501', null, 'someone outside the PG cannot give app access'
);
select throws_ok(
  $$select public.grant_resident_app_access('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'f1200000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'a login that already belongs to staff cannot become a resident login'
);
select is(
  public.grant_resident_app_access('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'f1200000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002') ->> 'state',
  'active', 'the owner can give a resident app access'
);
select is(
  (select membership.role::text || ':' || membership.state from public.memberships as membership
   join public.tenant_profiles as resident on resident.membership_id = membership.id
   where resident.id = 'f1200000-0000-0000-0000-000000000001'),
  'tenant:active', 'the resident is linked to an active tenant membership'
);
select throws_ok(
  $$select public.grant_resident_app_access('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-0000000000a1', 'f1200000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003')$$,
  'P0001', 'This resident already has app access.', 'a resident cannot be given a second login'
);
select is(
  public.set_resident_app_access_state('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'disabled') ->> 'state',
  'disabled', 'the owner can turn app access off'
);
select is(
  public.set_resident_app_access_state('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'active') ->> 'state',
  'active', 'the owner can turn app access back on'
);

update public.tenant_profiles set state = 'moved_out' where id = 'f1200000-0000-0000-0000-000000000001';
select is(
  (select state from public.memberships where auth_user_id = 'f1000000-0000-0000-0000-000000000002'),
  'disabled', 'moving out turns app access off automatically'
);
select throws_ok(
  $$select public.set_resident_app_access_state('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'f1200000-0000-0000-0000-000000000001', 'active')$$,
  'P0001', 'Only current residents can use the app.', 'a former resident cannot be given access again'
);

delete from public.tenant_profiles where id = 'f1200000-0000-0000-0000-000000000001';
select is(
  (select pg_catalog.count(*)::integer from public.memberships where auth_user_id = 'f1000000-0000-0000-0000-000000000002'),
  0, 'removing the resident record removes the membership'
);

select * from finish();
rollback;

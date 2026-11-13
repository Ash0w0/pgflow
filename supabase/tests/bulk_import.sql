begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, aud, role, email) values
  ('c1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'import-owner@example.test');
insert into public.organizations (id, name, slug, template_version_id, state)
values ('cc100000-0000-0000-0000-000000000001', 'Import PG', 'import-pg', (select id from public.template_versions where version = '1.0.0'), 'live');
insert into public.properties (id, organization_id, name)
values ('cc100000-0000-0000-0000-0000000000a1', 'cc100000-0000-0000-0000-000000000001', 'Import PG');
insert into public.memberships (organization_id, property_id, auth_user_id, phone, display_name, role, state)
values ('cc100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-000000000001', '+919000004001', 'Import Owner', 'owner', 'active');

create temporary table import_rooms as select '[
  {"row":2,"floor":"Ground","code":"G-1","capacity":2,"roomType":"double","defaultRent":8000,"state":"active"},
  {"row":3,"floor":"First","code":"F-1","capacity":1,"roomType":"single","defaultRent":9000,"state":"active"}
]'::jsonb as value;
create temporary table import_residents as select '[
  {"row":2,"fullName":"Asha Rao","phone":"+919876500001","alternatePhone":"","emergencyName":"Ravi Rao","emergencyPhone":"+919876500002","address":"","roomCode":"G-1","bedLabel":"Bed 1","moveInDate":"2026-11-01","monthlyRent":8000,"depositPromised":16000,"openingDue":500}
]'::jsonb as value;
create temporary table bad_residents as select '[
  {"row":7,"fullName":"Nobody","phone":"+919876500003","alternatePhone":"","emergencyName":"Ravi Rao","emergencyPhone":"+919876500002","address":"","roomCode":"Z-9","bedLabel":"Bed 1","moveInDate":"2026-11-01","monthlyRent":8000,"depositPromised":0,"openingDue":0}
]'::jsonb as value;

select is(
  (public.bulk_import_property('c1000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-0000000000a1',
    (select value from import_rooms), (select value from import_residents), true) ->> 'residentsOnboarded')::integer,
  1, 'a check run reports what would be imported'
);
select is((select pg_catalog.count(*)::integer from public.rooms where organization_id = 'cc100000-0000-0000-0000-000000000001'), 0, 'a check run saves nothing');

select throws_like(
  'select public.bulk_import_property(''c1000000-0000-0000-0000-000000000001'', ''cc100000-0000-0000-0000-000000000001'', ''cc100000-0000-0000-0000-0000000000a1'', (select value from import_rooms), (select value from bad_residents), false)',
  'Residents row 7: room Z-9 has no Bed 1%',
  'a bad row is reported with its spreadsheet row number'
);
select is((select pg_catalog.count(*)::integer from public.rooms where organization_id = 'cc100000-0000-0000-0000-000000000001'), 0, 'a failed import saves no rows at all');

select is(
  (public.bulk_import_property('c1000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-0000000000a1',
    (select value from import_rooms), (select value from import_residents), false) ->> 'bedsCreated')::integer,
  3, 'a committed import creates rooms and their beds'
);
select is(
  (select pg_catalog.count(*)::integer from public.tenant_profiles where organization_id = 'cc100000-0000-0000-0000-000000000001' and state = 'active'),
  1, 'a committed import onboards residents into beds'
);
select is(
  (public.bulk_import_property('c1000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-0000000000a1',
    (select value from import_rooms), '[]'::jsonb, true) ->> 'roomsAlreadyPresent')::integer,
  2, 'existing rooms are kept, not duplicated'
);

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select is(public.pgflow_schema_version(), (select max(version) from supabase_migrations.schema_migrations where version ~ '^[0-9]{4}$'), 'reports the latest applied update');
select ok(not has_function_privilege('anon', 'public.pgflow_schema_version()', 'execute'), 'anonymous callers cannot read the schema version');
select ok(not has_function_privilege('authenticated', 'public.pgflow_schema_version()', 'execute'), 'signed-in users cannot read the schema version');

select * from finish();
rollback;

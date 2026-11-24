-- Lets /api/health compare the database's latest applied update with the
-- update the deployed code expects. Before this, health only checked that
-- one table from 0040 existed, so 0041 and 0042 went unapplied in production
-- while health still said "current".

create or replace function public.pgflow_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(version), '')
  from supabase_migrations.schema_migrations
  where version ~ '^[0-9]{4}$';
$$;

revoke all on function public.pgflow_schema_version() from public, anon, authenticated;
grant execute on function public.pgflow_schema_version() to service_role;

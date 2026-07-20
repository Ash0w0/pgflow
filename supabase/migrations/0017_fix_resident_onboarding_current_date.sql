-- CURRENT_DATE is a SQL value expression, not a pg_catalog relation.
-- Replace only the invalid qualification in the exact function installed by 0016.

do $$
declare
  v_function_sql text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.onboard_resident_to_bed(uuid,uuid,uuid,uuid,text,text,text,text,text,text,date,bigint,bigint,bigint)'::pg_catalog.regprocedure
  )
  into v_function_sql;

  if pg_catalog.strpos(v_function_sql, 'pg_catalog.current_date') = 0 then
    raise exception 'Expected resident onboarding CURRENT_DATE expression was not found.';
  end if;

  v_function_sql := pg_catalog.replace(
    v_function_sql,
    'pg_catalog.current_date',
    'CURRENT_DATE'
  );

  execute v_function_sql;
end;
$$;

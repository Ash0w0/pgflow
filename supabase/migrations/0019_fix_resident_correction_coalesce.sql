-- COALESCE is a SQL expression and cannot be schema-qualified.

do $$
declare
  v_function_sql text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_active_resident_details(uuid,uuid,uuid,uuid,text,text,text,text,text,text,date,bigint,bigint)'::pg_catalog.regprocedure
  )
  into v_function_sql;

  if pg_catalog.strpos(v_function_sql, 'pg_catalog.coalesce') = 0 then
    raise exception 'Expected resident correction COALESCE expression was not found.';
  end if;

  v_function_sql := pg_catalog.replace(v_function_sql, 'pg_catalog.coalesce', 'coalesce');
  execute v_function_sql;
end;
$$;

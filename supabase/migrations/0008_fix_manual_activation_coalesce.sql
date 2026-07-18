-- Repair SQL-standard COALESCE expressions in the two manual activation
-- functions installed by 0007. COALESCE is syntax, not a schema-qualified
-- PostgreSQL function, so `pg_catalog.coalesce(...)` is invalid at runtime.
--
-- The replacement is idempotent. On a fresh database, corrected 0007 already
-- contains `coalesce(...)`, and this migration safely becomes a no-op.

do $migration$
declare
  v_function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.complete_manual_owner_activation(uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure
  ) into strict v_function_definition;

  if pg_catalog.strpos(v_function_definition, 'pg_catalog.coalesce') > 0 then
    execute pg_catalog.replace(
      v_function_definition,
      'pg_catalog.coalesce',
      'coalesce'
    );
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.complete_manual_owner_activation_on_auth_user()'::pg_catalog.regprocedure
  ) into strict v_function_definition;

  if pg_catalog.strpos(v_function_definition, 'pg_catalog.coalesce') > 0 then
    execute pg_catalog.replace(
      v_function_definition,
      'pg_catalog.coalesce',
      'coalesce'
    );
  end if;
end;
$migration$;

-- Fix maintenance tickets, move-out settlement, and WhatsApp logging.
--
-- COALESCE is SQL syntax, not a function in pg_catalog, so every call written
-- as `pg_catalog.coalesce(...)` fails at runtime with
-- "function pg_catalog.coalesce(...) does not exist". These three functions
-- (migrations 0026-0028) therefore failed on every call.
--
-- Each function is rewritten in place from its current definition, replacing
-- only that token. CREATE OR REPLACE preserves ownership, SECURITY DEFINER,
-- the empty search_path, and the existing grants. The migration fails closed
-- if a function is missing, already differs from what this fix expects, or
-- still contains the broken call afterwards.

do $$
declare
  v_signature text;
  v_definition text;
  v_fixed text;
begin
  foreach v_signature in array array[
    'public.create_maintenance_ticket(uuid,uuid,uuid,text,text,text,text,text)',
    'public.process_resident_moveout(uuid,uuid,uuid,date,numeric,numeric,numeric,text)',
    'public.log_whatsapp_message(uuid,text,text,text,text,text,text,text,jsonb,uuid)'
  ]
  loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Expected function % does not exist.', v_signature;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature));

    if pg_catalog.strpos(v_definition, 'SECURITY DEFINER') = 0
      or pg_catalog.strpos(v_definition, 'SET search_path TO ''''') = 0
    then
      raise exception 'Function % no longer has the expected security settings.', v_signature;
    end if;

    if pg_catalog.strpos(v_definition, 'pg_catalog.coalesce(') = 0 then
      raise exception 'Function % no longer contains the broken coalesce call.', v_signature;
    end if;

    v_fixed := pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', 'coalesce(');
    execute v_fixed;

    if pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature)),
      'pg_catalog.coalesce('
    ) > 0 then
      raise exception 'Function % still contains pg_catalog.coalesce.', v_signature;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_catalog.strpos(p.prosrc, 'pg_catalog.coalesce(') > 0
  ) then
    raise exception 'Another public function still calls pg_catalog.coalesce.';
  end if;
end;
$$;

-- Supabase Cron calls one authenticated Vercel worker every minute.
-- Before enabling a connection, create Vault secrets named:
--   pgflow_worker_base_url (for example https://staging.pgflow.co)
--   pgflow_worker_secret   (same value as WHATSAPP_WORKER_SECRET in Vercel)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_pgflow_whatsapp_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
begin
  select decrypted_secret into v_base_url
  from vault.decrypted_secrets where name = 'pgflow_worker_base_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'pgflow_worker_secret';
  if pg_catalog.coalesce(pg_catalog.btrim(v_base_url), '') = ''
    or pg_catalog.coalesce(pg_catalog.btrim(v_secret), '') = ''
  then
    return;
  end if;
  perform net.http_post(
    url := pg_catalog.rtrim(v_base_url, '/') || '/api/internal/whatsapp/run',
    headers := pg_catalog.jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end
$$;

revoke all on function public.invoke_pgflow_whatsapp_worker()
  from public, anon, authenticated;
grant execute on function public.invoke_pgflow_whatsapp_worker() to service_role;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'pgflow-whatsapp-worker';
  perform cron.schedule(
    'pgflow-whatsapp-worker',
    '* * * * *',
    'select public.invoke_pgflow_whatsapp_worker()'
  );
end
$$;

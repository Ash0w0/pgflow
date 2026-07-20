create table public.auth_rate_limit_buckets (
  bucket_hash text primary key,
  scope text not null,
  attempts integer not null,
  window_started_at timestamptz not null,
  reset_at timestamptz not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint auth_rate_limit_buckets_hash_check
    check (bucket_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_rate_limit_buckets_scope_check
    check (scope in ('host_phone', 'host_ip')),
  constraint auth_rate_limit_buckets_attempts_check
    check (attempts between 1 and 100000),
  constraint auth_rate_limit_buckets_window_check
    check (reset_at > window_started_at and reset_at <= window_started_at + interval '1 day')
);

alter table public.auth_rate_limit_buckets enable row level security;
revoke all on public.auth_rate_limit_buckets from public, anon, authenticated, service_role;

create or replace function public.consume_auth_rate_limit(
  p_bucket_hash text,
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  "allowed" boolean,
  "retryAfterSeconds" integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := statement_timestamp();
  v_bucket public.auth_rate_limit_buckets%rowtype;
begin
  if p_bucket_hash is null or p_bucket_hash !~ '^[0-9a-f]{64}$'
    or p_scope not in ('host_phone', 'host_ip')
    or p_limit < 1 or p_limit > 1000
    or p_window_seconds < 60 or p_window_seconds > 86400
  then
    raise exception using errcode = '22023', message = 'Invalid authentication rate-limit parameters.';
  end if;

  insert into public.auth_rate_limit_buckets as bucket (
    bucket_hash,
    scope,
    attempts,
    window_started_at,
    reset_at,
    updated_at
  ) values (
    p_bucket_hash,
    p_scope,
    1,
    v_now,
    v_now + pg_catalog.make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (bucket_hash) do update
  set scope = excluded.scope,
      attempts = case when bucket.reset_at <= v_now then 1 else bucket.attempts + 1 end,
      window_started_at = case when bucket.reset_at <= v_now then v_now else bucket.window_started_at end,
      reset_at = case
        when bucket.reset_at <= v_now then v_now + pg_catalog.make_interval(secs => p_window_seconds)
        else bucket.reset_at
      end,
      updated_at = v_now
  returning bucket.* into v_bucket;

  return query select
    v_bucket.attempts <= p_limit,
    greatest(1, ceil(extract(epoch from (v_bucket.reset_at - v_now)))::integer);
end;
$function$;

revoke all on function public.consume_auth_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer)
  to service_role;

comment on table public.auth_rate_limit_buckets is
  'Server-only authentication throttling buckets. Keys are HMAC digests; raw phone numbers and IP addresses are never stored here.';

-- Enforce canonical ASCII DNS hostnames at the persistence boundary.
-- Internationalized labels remain supported through their lowercase punycode form.

alter table public.domain_mappings
  drop constraint if exists domain_mappings_normalized_hostname_check;

alter table public.domain_mappings
  add constraint domain_mappings_normalized_hostname_check
  check (
    hostname = pg_catalog.lower(pg_catalog.btrim(hostname))
    and pg_catalog.char_length(hostname) between 1 and 253
    and hostname !~ '[,/:]'
    and hostname !~ '[[:space:][:cntrl:]]'
    and hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
  );

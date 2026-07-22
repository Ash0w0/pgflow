-- Custom domain verification infrastructure.
-- Adds DNS TXT challenge tokens and verification timestamps
-- to support PG owners bringing their own domains (e.g., nivasastay.com).

-- Add verification columns to domain_mappings
alter table public.domain_mappings
  add column if not exists dns_txt_challenge text
    check (dns_txt_challenge is null or (
      dns_txt_challenge = btrim(dns_txt_challenge)
      and char_length(dns_txt_challenge) between 32 and 128
      and dns_txt_challenge ~ '^[a-zA-Z0-9_-]+$'
    ));

alter table public.domain_mappings
  add column if not exists verified_at timestamptz;

alter table public.domain_mappings
  add column if not exists last_checked_at timestamptz;

-- Expand the state machine to include dns_checking
alter table public.domain_mappings
  drop constraint if exists domain_mappings_state_check;

alter table public.domain_mappings
  add constraint domain_mappings_state_check
  check (state in ('pending', 'dns_checking', 'verified', 'failed'));

-- Verified custom domains must have a DNS challenge token
alter table public.domain_mappings
  add constraint domain_mappings_custom_requires_challenge
  check (
    kind = 'platform_subdomain'
    or state != 'verified'
    or (kind = 'custom' and dns_txt_challenge is not null)
  );

-- Verified custom domains must have a verified_at timestamp
alter table public.domain_mappings
  add constraint domain_mappings_verified_timestamp
  check (
    state != 'verified'
    or verified_at is not null
  );

-- Auto-verify existing platform subdomains
update public.domain_mappings
  set state = 'verified', verified_at = now()
  where kind = 'platform_subdomain' and state = 'pending';

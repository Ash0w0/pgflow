-- Daily housekeeping for short-lived operational rows. Financial and audit
-- records are never touched here.
--
-- * Authentication rate-limit buckets are useless once their window has reset.
-- * Receipt links are useless once expired (the receipt itself is kept).
-- * Finished WhatsApp outbox rows are kept 90 days for delivery support; the
--   permanent record of a sent message is whatsapp_message_logs.

create or replace function public.prune_expired_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate_limits integer;
  v_receipt_links integer;
  v_outbox integer;
begin
  delete from public.auth_rate_limit_buckets
  where reset_at < pg_catalog.now() - interval '1 day';
  get diagnostics v_rate_limits = row_count;

  delete from public.receipt_links
  where expires_at < pg_catalog.now();
  get diagnostics v_receipt_links = row_count;

  delete from public.whatsapp_outbox
  where state in ('sent', 'skipped', 'failed')
    and updated_at < pg_catalog.now() - interval '90 days';
  get diagnostics v_outbox = row_count;

  return pg_catalog.jsonb_build_object(
    'authRateLimitBuckets', v_rate_limits,
    'receiptLinks', v_receipt_links,
    'whatsappOutbox', v_outbox
  );
end;
$$;

revoke all on function public.prune_expired_operational_data() from public, anon, authenticated;
grant execute on function public.prune_expired_operational_data() to service_role;

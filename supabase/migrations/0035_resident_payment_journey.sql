-- Keep resident payment links useful throughout review and expose immutable receipts.

create or replace function public.reopen_rejected_public_payment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state = 'pending_review' and new.state = 'rejected' and new.payment_request_id is not null then
    update public.invoice_payment_requests
    set state = 'active',
        submitted_at = null,
        expires_at = pg_catalog.greatest(expires_at, pg_catalog.now() + interval '7 days')
    where id = new.payment_request_id and state = 'submitted';
  end if;
  return new;
end
$$;

drop trigger if exists payments_reopen_rejected_public_request on public.payments;
create trigger payments_reopen_rejected_public_request
after update of state on public.payments
for each row execute function public.reopen_rejected_public_payment_request();

create or replace function public.record_resident_receipt_open(
  p_token_hash text,
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.resident_receipt_links;
begin
  update public.resident_receipt_links
  set open_count = open_count + 1,
      last_opened_at = pg_catalog.now()
  where token_hash = p_token_hash
    and receipt_id = p_receipt_id
    and revoked_at is null
    and expires_at > pg_catalog.now()
  returning * into v_link;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'organizationId', v_link.organization_id,
    'receiptId', v_link.receipt_id,
    'tenantId', v_link.tenant_id,
    'expiresAt', v_link.expires_at
  );
end
$$;

revoke all on function public.record_resident_receipt_open(text,uuid)
  from public, anon, authenticated;
grant execute on function public.record_resident_receipt_open(text,uuid) to service_role;

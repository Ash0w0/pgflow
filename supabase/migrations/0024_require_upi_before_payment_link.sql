create or replace function public.enforce_payment_request_upi_configuration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.properties
    where organization_id = new.organization_id
      and id = new.property_id
      and nullif(pg_catalog.btrim(upi_id), '') is not null
      and nullif(pg_catalog.btrim(upi_payee_name), '') is not null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Configure the property UPI ID and payee name before creating a payment link.';
  end if;
  return new;
end
$$;

drop trigger if exists invoice_payment_requests_require_upi
  on public.invoice_payment_requests;
create trigger invoice_payment_requests_require_upi
before insert on public.invoice_payment_requests
for each row execute function public.enforce_payment_request_upi_configuration();

revoke all on function public.enforce_payment_request_upi_configuration() from public;

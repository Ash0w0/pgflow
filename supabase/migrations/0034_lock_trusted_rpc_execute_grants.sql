-- Close direct client access to trusted server-only RPCs.
--
-- Earlier migrations ran `revoke all ... from public`, but Supabase also grants
-- EXECUTE on every new public-schema function directly to `anon` and
-- `authenticated` through default privileges. Revoking from PUBLIC does not
-- remove those explicit grants, so these SECURITY DEFINER functions, which
-- trust caller-supplied actor/organization/property IDs, were reachable through
-- PostgREST with only the publishable key.
--
-- Trusted business RPCs are server-only (service_role). RLS helper functions
-- remain executable by `authenticated` because row-level and Storage policies
-- call them as the signed-in user; they derive identity from auth.uid().

-- 1. Trusted business RPCs: service_role only.
revoke execute on function public.generate_monthly_rent_invoices(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.submit_upi_payment_evidence(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.review_payment(uuid, uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.record_cash_payment(uuid, uuid, uuid, uuid, bigint, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.update_property_upi(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.create_invoice_payment_request(uuid, uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.record_invoice_payment_request_open(text, uuid) from public, anon, authenticated;
revoke execute on function public.submit_public_upi_payment_evidence(text, uuid, bigint, text, timestamptz, text, text, text, text) from public, anon, authenticated;

grant execute on function public.generate_monthly_rent_invoices(uuid, uuid, uuid, text) to service_role;
grant execute on function public.submit_upi_payment_evidence(uuid, uuid, uuid, uuid, bigint, text, timestamptz, text, text, text, text) to service_role;
grant execute on function public.review_payment(uuid, uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.record_cash_payment(uuid, uuid, uuid, uuid, bigint, timestamptz, text) to service_role;
grant execute on function public.update_property_upi(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.create_invoice_payment_request(uuid, uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.record_invoice_payment_request_open(text, uuid) to service_role;
grant execute on function public.submit_public_upi_payment_evidence(text, uuid, bigint, text, timestamptz, text, text, text, text) to service_role;

-- 2. Trigger functions are invoked by the trigger mechanism, not by clients.
revoke execute on function public.enforce_payment_request_upi_configuration() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 3. RLS helpers: signed-in users only; anonymous visitors never need them.
revoke execute on function public.current_organization_ids() from public, anon;
revoke execute on function public.has_org_role(uuid, public.membership_role[]) from public, anon;
revoke execute on function public.is_own_tenant(uuid, uuid) from public, anon;
revoke execute on function public.has_storage_org_membership(text, public.membership_role[]) from public, anon;
grant execute on function public.current_organization_ids() to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.membership_role[]) to authenticated, service_role;
grant execute on function public.is_own_tenant(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_storage_org_membership(text, public.membership_role[]) to authenticated, service_role;

-- 4. Stop future migrations from inheriting client EXECUTE grants. Tables in
-- this schema already had their client default privileges removed; functions
-- now follow the same rule, so every client-callable function needs an
-- explicit, reviewed grant.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- 5. Fail closed if any SECURITY DEFINER function is still reachable by
-- anonymous clients, or by signed-in clients outside the RLS-helper allowlist.
do $$
declare
  v_exposed text;
begin
  select pg_catalog.string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
  into v_exposed
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      or (
        pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in ('current_organization_ids', 'has_org_role', 'is_own_tenant', 'has_storage_org_membership')
      )
    );

  if v_exposed is not null then
    raise exception 'Client-executable SECURITY DEFINER functions remain: %', v_exposed;
  end if;
end;
$$;

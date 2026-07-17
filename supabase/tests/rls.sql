-- Run with pgTAP or the Supabase local test workflow after creating fixture users.
-- Required assertions before production:
-- 1. owner_org_a cannot select organizations/tenants/payments from org_b.
-- 2. tenant_a can select their own profile/invoices/payments only.
-- 3. manager_a cannot update brand_themes or approve payments.
-- 4. accountant_a cannot update occupancy or branding.
-- 5. disabled membership loses access after JWT refresh/session revocation.
-- 6. anonymous role has no grants on business tables.

begin;
select plan(1);
select has_function('public', 'current_organization_ids', array[]::text[], 'RLS organization helper exists');
select * from finish();
rollback;

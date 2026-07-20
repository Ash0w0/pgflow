import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("resident onboarding is atomic, owner-scoped, locked, and audited", async () => {
  const [migration, dateCorrection] = await Promise.all([
    readFile(new URL("supabase/migrations/0016_atomic_resident_onboarding.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0017_fix_resident_onboarding_current_date.sql", root), "utf8"),
  ]);

  assert.match(migration, /create or replace function public\.onboard_resident_to_bed/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /membership\.auth_user_id = p_actor_user_id/i);
  assert.match(migration, /membership\.organization_id = p_organization_id/i);
  assert.match(migration, /membership\.property_id = p_property_id/i);
  assert.match(migration, /membership\.role = 'owner'/i);
  assert.match(migration, /membership\.state = 'active'/i);
  assert.match(migration, /for update of bed/i);
  assert.match(migration, /v_bed\.bed_state <> 'vacant'/i);
  assert.match(migration, /v_bed\.room_state <> 'active'/i);
  assert.match(migration, /v_bed\.floor_state <> 'active'/i);
  assert.match(migration, /insert into public\.tenant_profiles/i);
  assert.match(migration, /emergency_name, emergency_phone, address, state/i);
  assert.match(migration, /insert into public\.occupancies/i);
  assert.match(migration, /update public\.beds[\s\S]*?state = 'occupied'/i);
  assert.match(migration, /if p_opening_due > 0 then/i);
  assert.match(migration, /insert into public\.invoices/i);
  assert.match(migration, /insert into public\.invoice_line_items/i);
  assert.match(migration, /'resident\.onboarded'/i);
  assert.match(migration, /revoke all on function public\.onboard_resident_to_bed[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.onboard_resident_to_bed[\s\S]*?to service_role/i);
  assert.match(dateCorrection, /pg_get_functiondef/i);
  assert.match(dateCorrection, /pg_catalog\.strpos/i);
  assert.match(dateCorrection, /pg_catalog\.replace/i);
  assert.match(dateCorrection, /'pg_catalog\.current_date',[\s\S]*?'CURRENT_DATE'/i);
});

test("resident onboarding API trusts the authenticated owner context, not client tenancy", async () => {
  const [route, validation] = await Promise.all([
    readFile(new URL("app/api/residents/onboard/route.ts", root), "utf8"),
    readFile(new URL("lib/resident-onboarding-validation.ts", root), "utf8"),
  ]);

  assert.match(route, /isTrustedMutationRequest\(request\)/);
  assert.match(route, /MAX_BODY_BYTES = 4096/);
  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /Object\.keys\(body\)\.length !== 12/);
  assert.match(route, /normalizeIndianPhone/);
  assert.match(route, /confirmAssignment: body\.confirmAssignment/);
  assert.match(route, /rpc\("onboard_resident_to_bed"/);
  assert.match(route, /p_actor_user_id: actor\.id/);
  assert.match(route, /p_organization_id: actor\.organizationId/);
  assert.match(route, /p_property_id: actor\.propertyId/);
  assert.doesNotMatch(route, /body\.(?:organizationId|propertyId|actorId)/);
  assert.match(route, /error\.code === "23505"/);
  assert.match(route, /"cache-control": "no-store"/);
  assert.match(route, /validateResidentOnboardingInput/);
  assert.match(route, /fieldErrors/);
  assert.match(route, /Please correct the highlighted fields\./);
  assert.match(validation, /10-digit Indian mobile number starting with 6, 7, 8, or 9/);
  assert.match(validation, /alternatePhone = "Alternate phone must be different/);
  assert.match(validation, /confirmAssignment = "Confirm that you verified/);
});

test("resident register reads every business record through exact tenant scope", async () => {
  const service = await readFile(new URL("lib/resident-setup.ts", root), "utf8");

  assert.match(service, /import "server-only"/);
  for (const table of ["floors", "rooms", "beds", "tenant_profiles", "occupancies", "invoices"]) {
    const tableStart = service.indexOf(`.from("${table}")`);
    assert.notEqual(tableStart, -1, `${table} query must exist`);
    const nextQuery = service.indexOf(".from(\"", tableStart + 7);
    const query = service.slice(tableStart, nextQuery === -1 ? service.length : nextQuery);
    assert.match(query, /\.eq\("organization_id", organizationId\)/, `${table} must be organization scoped`);
    assert.match(query, /\.eq\("property_id", propertyId\)/, `${table} must be property scoped`);
  }
  assert.match(service, /bed\.state !== "vacant"/);
  assert.match(service, /room\.state !== "active"/);
  assert.match(service, /floor\.state !== "active"/);
});

test("resident UI distinguishes promises, balances, and actual payments", async () => {
  const [page, component] = await Promise.all([
    readFile(new URL("app/residents/page.tsx", root), "utf8"),
    readFile(new URL("components/resident-setup-workspace.tsx", root), "utf8"),
  ]);

  assert.match(page, /requireStaffPage\(\["owner"\]\)/);
  assert.match(page, /getResidentSetupData\(authorization\.actor\.organizationId, authorization\.actor\.propertyId\)/);
  assert.match(component, /fetch\("\/api\/residents\/onboard"/);
  assert.match(component, /confirmAssignment: confirmed/);
  assert.match(component, /router\.refresh\(\)/);
  assert.match(component, /This does not mark the deposit as received\./);
  assert.match(component, /No payment is recorded here\./);
  assert.match(component, /validateResidentOnboardingInput/);
  assert.match(component, /aria-invalid/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /resident-field-error/);
  assert.match(component, /noValidate/);
  assert.match(component, /clearFieldError/);
  assert.doesNotMatch(component, /api\/payments|insert.*payments/i);
});

test("resident corrections are owner-scoped, atomic, audited, and PII-minimal", async () => {
  const [migration, correction] = await Promise.all([
    readFile(new URL("supabase/migrations/0018_resident_corrections_and_safe_undo.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0019_fix_resident_correction_coalesce.sql", root), "utf8"),
  ]);

  assert.match(migration, /create or replace function public\.update_active_resident_details/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /membership\.auth_user_id = p_actor_user_id/i);
  assert.match(migration, /membership\.role = 'owner'/i);
  assert.match(migration, /membership\.state = 'active'/i);
  assert.match(migration, /tenant\.organization_id = p_organization_id/i);
  assert.match(migration, /tenant\.property_id = p_property_id/i);
  assert.match(migration, /from public\.tenant_profiles[\s\S]*?for update/i);
  assert.match(migration, /from public\.occupancies[\s\S]*?for update/i);
  assert.match(migration, /resident\.details_updated/i);
  assert.match(migration, /changedFields/);
  assert.doesNotMatch(migration, /'phone',\s*(?:v_tenant|p_phone)|'fullName',\s*(?:v_tenant|v_full_name)/i);
  assert.match(migration, /grant execute on function public\.update_active_resident_details[\s\S]*?to service_role/i);
  assert.match(correction, /pg_get_functiondef/i);
  assert.match(correction, /pg_catalog\.strpos/i);
  assert.match(correction, /'pg_catalog\.coalesce', 'coalesce'/i);
});

test("empty onboarding undo is time-limited, activity-blocked, reauthenticated, and audited", async () => {
  const [migration, route, reauth, dialog] = await Promise.all([
    readFile(new URL("supabase/migrations/0018_resident_corrections_and_safe_undo.sql", root), "utf8"),
    readFile(new URL("app/api/residents/[residentId]/route.ts", root), "utf8"),
    readFile(new URL("lib/owner-reauth.ts", root), "utf8"),
    readFile(new URL("components/resident-management-dialog.tsx", root), "utf8"),
  ]);

  assert.match(migration, /create or replace function public\.undo_empty_resident_onboarding/i);
  assert.match(migration, /v_tenant\.membership_id is not null/i);
  assert.match(migration, /interval '24 hours'/i);
  assert.match(migration, /exists \(select 1 from public\.invoices/i);
  assert.match(migration, /exists \(select 1 from public\.payments/i);
  assert.match(migration, /pg_catalog\.btrim\(p_confirmation_name\) <> v_tenant\.full_name/i);
  assert.match(migration, /set state = 'vacant'/i);
  assert.match(migration, /delete from public\.occupancies[\s\S]*?delete from public\.tenant_profiles/i);
  assert.match(migration, /resident\.empty_onboarding_undone/i);
  assert.match(migration, /grant execute on function public\.undo_empty_resident_onboarding[\s\S]*?to service_role/i);

  assert.match(route, /export async function PATCH/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /Object\.keys\(body\)\.length !== 3/);
  assert.match(route, /currentPassword/);
  assert.match(route, /consumeAuthenticationLimits/);
  assert.match(route, /verifyOwnerPassword\(user\.id, user\.phone, currentPassword\)/);
  assert.match(route, /p_actor_user_id: authorized\.actor\.id/);
  assert.match(route, /p_organization_id: authorized\.actor\.organizationId/);
  assert.match(route, /p_property_id: authorized\.actor\.propertyId/);
  assert.doesNotMatch(route, /body\.(?:organizationId|propertyId|actorId|tenantId)/);

  assert.match(reauth, /import "server-only"/);
  assert.match(reauth, /persistSession: false/);
  assert.match(reauth, /signInWithPassword/);
  assert.match(reauth, /signOut\(\{ scope: "local" \}\)/);

  assert.match(dialog, /autoComplete="current-password"/);
  assert.match(dialog, /confirmationName !== resident\.fullName/);
  assert.match(dialog, /method: "DELETE"/);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|document\.cookie/);
});

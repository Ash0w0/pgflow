import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("monthly rent generation is owner-scoped, atomic, current-period-only, and idempotent", async () => {
  const migration = await readFile(new URL("supabase/migrations/0020_monthly_rent_generation.sql", root), "utf8");

  assert.match(migration, /create table public\.billing_cycles/i);
  assert.match(migration, /unique \(organization_id, property_id, period\)/i);
  assert.match(migration, /create or replace function public\.generate_monthly_rent_invoices/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /auth_user_id = p_actor_user_id/i);
  assert.match(migration, /organization_id = p_organization_id/i);
  assert.match(migration, /property_id = p_property_id/i);
  assert.match(migration, /role = 'owner'/i);
  assert.match(migration, /state = 'active'/i);
  assert.match(migration, /first release can generate only the current month/i);
  assert.match(migration, /if exists \([\s\S]*?from public\.invoices[\s\S]*?period = p_period/i);
  assert.match(migration, /insert into public\.invoices[\s\S]*?insert into public\.invoice_line_items/i);
  assert.match(migration, /'billing\.monthly_generated'/i);
  assert.match(migration, /grant execute on function public\.generate_monthly_rent_invoices[\s\S]*?to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.generate_monthly_rent_invoices[\s\S]*?to authenticated/i);
});

test("billing API derives tenancy and period from the authenticated owner", async () => {
  const route = await readFile(new URL("app/api/billing/generate-monthly/route.ts", root), "utf8");

  assert.match(route, /isTrustedMutationRequest\(request\)/);
  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /currentIndiaBillingPeriod\(\)/);
  assert.match(route, /record\.period !== period/);
  assert.match(route, /record\.confirmGeneration !== true/);
  assert.match(route, /p_actor_user_id: actor\.id/);
  assert.match(route, /p_organization_id: actor\.organizationId/);
  assert.match(route, /p_property_id: actor\.propertyId/);
  assert.doesNotMatch(route, /record\.(?:organizationId|propertyId|actorId)/);
  assert.match(route, /"cache-control": "no-store"/);
});

test("Collections UI previews charges and never generates without explicit confirmation", async () => {
  const [page, component, service] = await Promise.all([
    readFile(new URL("app/collections/page.tsx", root), "utf8"),
    readFile(new URL("components/collections-workspace.tsx", root), "utf8"),
    readFile(new URL("lib/collections.ts", root), "utf8"),
  ]);

  assert.match(page, /requireStaffPage\(\["owner", "manager", "accountant"\]\)/);
  assert.match(page, /canGenerate=\{authorization\.actor\.role === "owner"\}/);
  assert.match(component, /confirmGeneration: true/);
  assert.match(component, /!confirmed/);
  assert.match(component, /does not record payments\./);
  assert.match(component, /Duplicate-safe/);
  assert.match(component, /router\.refresh\(\)/);
  for (const table of ["properties", "tenant_profiles", "occupancies", "beds", "rooms", "invoices"]) {
    const start = service.indexOf(`.from("${table}")`);
    assert.notEqual(start, -1, `${table} query must exist`);
    const end = service.indexOf(".from(\"", start + 7);
    const query = service.slice(start, end === -1 ? service.length : end);
    assert.match(query, /\.eq\("organization_id", organizationId\)/, `${table} must be organization scoped`);
    assert.match(query, /\.eq\((?:"property_id"|"id"), propertyId\)/, `${table} must be property scoped`);
  }
});

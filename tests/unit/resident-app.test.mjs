import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("resident app access is granted, revoked and cleaned up in the database", async () => {
  const migration = await read("supabase/migrations/0042_resident_app_access.sql");
  assert.match(migration, /role in \('owner', 'manager'\)/);
  assert.match(migration, /'tenant', 'active'\)/);
  assert.match(migration, /This resident already has app access\./);
  assert.match(migration, /after update of state on public\.tenant_profiles/);
  assert.match(migration, /after delete on public\.tenant_profiles/);
  assert.match(migration, /revoke all on function public\.grant_resident_app_access\(uuid, uuid, uuid, uuid, uuid\) from public, anon, authenticated/);
  assert.match(migration, /state in \('active','notice'\)/, "residents on notice can still submit payment proof");
});

test("the access route never leaves an orphan login and never returns stored secrets", async () => {
  const route = await read("app/api/residents/[residentId]/app-access/route.ts");
  assert.match(route, /requireActor\(request, \["owner", "manager"\]\)/);
  assert.match(route, /isTrustedMutationRequest/);
  assert.match(route, /MUST_CHANGE_PASSWORD_FLAG\]: true/);
  assert.match(route, /auth\.admin\.deleteUser\(created\.user\.id\)/);
  assert.match(route, /ban_duration/);
  assert.doesNotMatch(route, /select\("\*"\)/);
});

test("a resident only ever reads and writes their own records", async () => {
  const [loader, complaints, receipt, payPage, tenantPage] = await Promise.all([
    read("lib/resident-app.ts"),
    read("app/api/tenant/complaints/route.ts"),
    read("app/api/payments/[paymentId]/receipt/route.ts"),
    read("app/pay/[invoiceId]/page.tsx"),
    read("app/tenant/page.tsx"),
  ]);
  for (const table of ["invoices", "payments", "receipts"]) {
    assert.match(loader, new RegExp(`from\\("${table}"\\)[^\\n]*\\.eq\\("tenant_id", residentId\\)`));
  }
  assert.match(loader, /from\("maintenance_tickets"\)[^\n]*\.eq\("resident_id", residentId\)/);
  assert.match(complaints, /requireActor\(request, \["tenant"\]\)/);
  assert.match(complaints, /p_resident_id: actor\.tenantId/);
  assert.doesNotMatch(complaints, /body\.residentId|body\.roomNumber/);
  assert.match(receipt, /actor\.role === "tenant" && receipt\.tenantId !== actor\.tenantId/);
  assert.match(payPage, /invoiceBelongsToResident/);
  assert.match(tenantPage, /requireTenantPage\(\)/);
  assert.doesNotMatch(tenantPage, /^import .*['"]@\/demo\//m);
});

test("every resident-facing string exists in both English and Hindi", async () => {
  const copy = await read("components/resident-app/copy.ts");
  const keys = (block) => new Set([...block.replace(/\([^()]*\)\s*=>/g, "=>").matchAll(/(?:^|[\s,{])([a-zA-Z]+):/g)].map((match) => match[1]));
  const english = keys(copy.slice(copy.indexOf("const en = {"), copy.indexOf("const hi:")));
  const hindi = keys(copy.slice(copy.indexOf("const hi:"), copy.indexOf("export const COPY")));
  assert.ok(english.size > 60);
  assert.deepEqual([...english].filter((key) => !hindi.has(key)), []);
});

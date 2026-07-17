import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("service worker never caches private tenant or financial routes", async () => {
  const source = await readFile(new URL("public/sw.js", root), "utf8");
  assert.doesNotMatch(source, /SAFE_ASSETS[^;]*\/tenant/);
  assert.doesNotMatch(source, /caches\.match\(["']\/tenant/);
  assert.match(source, /request\.mode === ["']navigate/);
  assert.match(source, /\/api\//);
});

test("payment demo emits no UPI scheme or plausible VPA", async () => {
  const source = await readFile(new URL("components/payment-request.tsx", root), "utf8");
  assert.doesNotMatch(source, /upi:\/\/pay/i);
  assert.doesNotMatch(source, /demo\.nivasa@upi/i);
  assert.match(source, /PGFLOW-DEMO-NOT-A-PAYMENT/);
});

test("starter preview is fully removed", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.doesNotMatch(page + layout + packageJson, /SkeletonPreview|codex-preview|react-loading-skeleton|Starter Project/);
  assert.match(layout, /PGFlow/);
});

test("production RLS separates tenant records from organization-wide finance", async () => {
  const sql = await readFile(new URL("supabase/migrations/0001_platform.sql", root), "utf8");
  assert.match(sql, /is_own_tenant/);
  assert.match(sql, /invoices_scoped_select/);
  assert.match(sql, /payments_scoped_select/);
  assert.match(sql, /evidence_scoped_select/);
  assert.doesNotMatch(sql, /properties_org_access|rooms_org_access|beds_org_access|payments_org_select|invoices_org_select/);
  assert.match(sql, /foreign key \(organization_id, tenant_id\)/);
  assert.match(sql, /intentionally have no client mutation policy/);
});

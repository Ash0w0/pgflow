import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizePlan } from "../../lib/plan.ts";

const root = new URL("../../", import.meta.url);
const now = Date.parse("2026-11-12T10:00:00Z");
const day = 24 * 60 * 60 * 1000;

test("a PG is on trial until the trial ends", () => {
  const plan = summarizePlan(new Date(now + 15 * day).toISOString(), null, now);
  assert.equal(plan.status, "trial");
  assert.equal(plan.daysLeft, 15);
});

test("a partial day counts as a day left", () => {
  assert.equal(summarizePlan(new Date(now + 3 * 60 * 60 * 1000).toISOString(), null, now).daysLeft, 1);
});

test("a lapsed trial with no payment is expired", () => {
  const plan = summarizePlan(new Date(now - 1000).toISOString(), null, now);
  assert.deepEqual(plan, { status: "expired", endsAt: null, daysLeft: 0 });
});

test("a current paid period wins over an expired trial", () => {
  const plan = summarizePlan(new Date(now - day).toISOString(), new Date(now + 30 * day).toISOString(), now);
  assert.equal(plan.status, "paid");
  assert.equal(plan.daysLeft, 30);
});

test("a lapsed paid period with a lapsed trial is expired", () => {
  assert.equal(summarizePlan(new Date(now - 2 * day).toISOString(), new Date(now - day).toISOString(), now).status, "expired");
});

test("the trial migration enforces read-only writes in the database and audits plan changes", async () => {
  const migration = await readFile(new URL("supabase/migrations/0036_trial_and_paid_plan.sql", root), "utf8");
  assert.match(migration, /default \(pg_catalog\.now\(\) \+ interval '15 days'\)/);
  for (const table of ["tenant_profiles", "floors", "rooms", "beds", "invoices", "invoice_payment_requests", "payments"]) {
    assert.match(migration, new RegExp(`on public\\.${table}\\s+for each row execute function public\\.enforce_organization_plan_write`));
  }
  assert.match(migration, /insert into public\.platform_audit_events/);
  assert.match(migration, /revoke all on function public\.set_organization_plan[^;]*from public, anon, authenticated/);
});

test("plan changes require the operator's password and the old unaudited limit route is gone", async () => {
  const route = await readFile(new URL("app/api/organizations/plan/route.ts", root), "utf8");
  assert.match(route, /requireOperatorActor\(request\)/);
  assert.match(route, /verifyOperatorPassword\(operatorUserId, operatorPassword\)/);
  await assert.rejects(readFile(new URL("app/api/organizations/resident-limit/route.ts", root), "utf8"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateMoveOutSettlement } from "../../lib/resident-settlement.ts";

const root = new URL("../../", import.meta.url);

test("calculates move-out settlement with deposit deductions", () => {
  const settlement = calculateMoveOutSettlement({
    depositAmount: 10000,
    utilityDeductions: 800,
    damageDeductions: 500,
    unpaidRentDeductions: 2000,
  });

  assert.equal(settlement.depositAmount, 10000);
  assert.equal(settlement.utilityDeductions, 800);
  assert.equal(settlement.damageDeductions, 500);
  assert.equal(settlement.unpaidRentDeductions, 2000);
  assert.equal(settlement.totalDeductions, 3300);
  // Net refund = 10000 - 3300 = 6700
  assert.equal(settlement.netRefundAmount, 6700);
});

test("handles move-out settlement when deductions equal deposit", () => {
  const settlement = calculateMoveOutSettlement({
    depositAmount: 8000,
    utilityDeductions: 3000,
    damageDeductions: 5000,
  });

  assert.equal(settlement.totalDeductions, 8000);
  assert.equal(settlement.netRefundAmount, 0);
});

test("verifies 0026 move-out settlement migration security contract", async () => {
  const rawMigration = await readFile(
    new URL("supabase/migrations/0026_deposit_and_moveout_settlement.sql", root),
    "utf8"
  );
  const migration = rawMigration.replace(/\r\n/g, "\n");

  assert.match(migration, /create table if not exists public\.resident_moveouts/i);
  assert.match(migration, /deposit_amount numeric\(10, 2\)/i);
  assert.match(migration, /unpaid_rent_deductions numeric\(10, 2\)/i);
  assert.match(migration, /net_refund_amount numeric\(10, 2\)/i);
  assert.match(migration, /alter table public\.resident_moveouts enable row level security/i);
  assert.match(migration, /grant select on public\.resident_moveouts to service_role/i);
  assert.match(
    migration,
    /create or replace function public\.process_resident_moveout/i
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /set state = 'departed'/i);
  assert.match(migration, /set state = 'vacant'/i);
  assert.match(migration, /resident\.moveout_completed/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createOrganizationSnapshot,
  validateSnapshotIntegrity,
  restoreFromSnapshot,
} from "../../lib/backup.ts";
import { createRehearsalProperty, onboardRehearsalResidents } from "../../lib/rehearsal-helpers.ts";

test("backup-restore drill: full lifecycle with integrity verification", async (t) => {
  // Phase 1: Provision
  const property = createRehearsalProperty(2, 5, 2, 8000);

  // Phase 2: Onboard residents
  const residents = onboardRehearsalResidents(property.beds, property.rooms, 15);

  // Phase 3: Generate invoices
  const invoices = residents.map((r, i) => ({
    id: `invoice_${String(i).padStart(3, "0")}`,
    tenantId: r.id,
    totalAmount: r.monthlyRent,
    paidAmount: i % 3 === 0 ? r.monthlyRent : 0,
    state: i % 3 === 0 ? "paid" : "issued",
  }));

  // Phase 4: Record payments
  const payments = invoices
    .filter((inv) => inv.state === "paid")
    .map((inv, i) => ({
      id: `payment_${String(i).padStart(3, "0")}`,
      invoiceId: inv.id,
      amount: inv.totalAmount,
      method: "upi",
      state: "approved",
    }));

  // Build the snapshot data
  const snapshotData = {
    floors: property.floors.map((f) => ({ ...f })),
    rooms: property.rooms.map((r) => ({ ...r })),
    beds: property.beds.map((b) => ({ ...b })),
    tenants: residents.map((r) => ({ ...r })),
    invoices,
    payments,
    settings: [{ id: "upi_config", upiId: "test@upi", payeeName: "Test PG" }],
  };

  // Create snapshot
  const snapshot = createOrganizationSnapshot("org_test_001", "Test PG", snapshotData);

  await t.test("snapshot has correct metadata", () => {
    assert.equal(snapshot.version, "1.0.0");
    assert.equal(snapshot.organizationId, "org_test_001");
    assert.equal(snapshot.organizationName, "Test PG");
    assert.ok(snapshot.exportedAt.length > 0);
  });

  await t.test("snapshot checksums are accurate", () => {
    const expectedRecords =
      property.floors.length +
      property.rooms.length +
      property.beds.length +
      residents.length +
      invoices.length +
      payments.length +
      1; // settings
    assert.equal(snapshot.checksums.totalRecords, expectedRecords);

    const expectedFinancial = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    assert.equal(snapshot.checksums.financialTotal, expectedFinancial);
  });

  // Validate integrity
  await t.test("snapshot passes referential integrity validation", () => {
    const report = validateSnapshotIntegrity(snapshot);
    assert.equal(report.valid, true, `Integrity errors: ${report.errors.join(", ")}`);
    assert.equal(report.errors.length, 0);
  });

  // Simulate destruction and restore
  await t.test("restore from snapshot matches original state", () => {
    // Save original data BEFORE destruction (deep clone from the snapshot which was frozen at creation)
    const restored = restoreFromSnapshot(snapshot);

    // Verify all record counts match
    assert.equal(restored.floors.length, property.floors.length);
    assert.equal(restored.rooms.length, property.rooms.length);
    assert.equal(restored.beds.length, property.beds.length);
    assert.equal(restored.tenants.length, residents.length);
    assert.equal(restored.invoices.length, invoices.length);
    assert.equal(restored.payments.length, payments.length);
    assert.equal(restored.settings.length, 1);

    // Verify financial totals match
    const restoredFinancial = restored.invoices.reduce(
      (sum, inv) => sum + (typeof inv.totalAmount === "number" ? inv.totalAmount : 0), 0
    );
    assert.equal(restoredFinancial, snapshot.checksums.financialTotal);
  });

  // Verify tenant isolation
  await t.test("restored data does not leak across organizations", () => {
    const orgBData = {
      floors: [{ id: "orgB_floor_1" }],
      rooms: [{ id: "orgB_room_1", floorId: "orgB_floor_1" }],
      beds: [{ id: "orgB_bed_1", roomId: "orgB_room_1" }],
      tenants: [{ id: "orgB_tenant_1", bedId: "orgB_bed_1" }],
      invoices: [{ id: "orgB_inv_1", tenantId: "orgB_tenant_1", totalAmount: 5000 }],
      payments: [],
      settings: [],
    };

    const snapshotB = createOrganizationSnapshot("org_test_002", "Test PG B", orgBData);
    const restoredA = restoreFromSnapshot(snapshot);
    const restoredB = restoreFromSnapshot(snapshotB);

    // Ensure no cross-contamination
    const allIdsA = new Set([
      ...restoredA.floors.map((f) => f.id),
      ...restoredA.rooms.map((r) => r.id),
      ...restoredA.beds.map((b) => b.id),
      ...restoredA.tenants.map((t) => t.id),
    ]);

    const allIdsB = new Set([
      ...restoredB.floors.map((f) => f.id),
      ...restoredB.rooms.map((r) => r.id),
      ...restoredB.beds.map((b) => b.id),
      ...restoredB.tenants.map((t) => t.id),
    ]);

    for (const id of allIdsA) {
      assert.ok(!allIdsB.has(id), `Org A record ${id} leaked into Org B`);
    }
    for (const id of allIdsB) {
      assert.ok(!allIdsA.has(id), `Org B record ${id} leaked into Org A`);
    }
  });

  // Integrity violation detection
  await t.test("detects referential integrity violations", () => {
    const brokenSnapshot = createOrganizationSnapshot("org_broken", "Broken PG", {
      floors: [],
      rooms: [{ id: "room_orphan", floorId: "nonexistent_floor" }],
      beds: [{ id: "bed_orphan", roomId: "nonexistent_room" }],
      tenants: [{ id: "tenant_orphan", bedId: "nonexistent_bed" }],
      invoices: [{ id: "inv_orphan", tenantId: "nonexistent_tenant", totalAmount: 1000 }],
      payments: [{ id: "pay_orphan", invoiceId: "nonexistent_invoice", amount: 1000 }],
      settings: [],
    });

    const report = validateSnapshotIntegrity(brokenSnapshot);
    assert.equal(report.valid, false);
    assert.ok(report.errors.length >= 4, `Expected at least 4 integrity errors, got ${report.errors.length}`);
  });
});

/**
 * Organization backup and snapshot utilities.
 * Exports all organization-scoped data as a portable JSON structure
 * and validates referential integrity for disaster recovery drills.
 */

export interface OrganizationSnapshot {
  version: "1.0.0";
  exportedAt: string;
  organizationId: string;
  organizationName: string;
  data: {
    floors: SnapshotRecord[];
    rooms: SnapshotRecord[];
    beds: SnapshotRecord[];
    tenants: SnapshotRecord[];
    invoices: SnapshotRecord[];
    payments: SnapshotRecord[];
    settings: SnapshotRecord[];
  };
  checksums: {
    totalRecords: number;
    financialTotal: number;
  };
}

export interface SnapshotRecord {
  id: string;
  [key: string]: unknown;
}

export interface IntegrityReport {
  valid: boolean;
  errors: string[];
  recordCounts: Record<string, number>;
}

/**
 * Creates an organization snapshot from in-memory data.
 * In production, this would query the database; for drills, it accepts pre-built data.
 */
export function createOrganizationSnapshot(
  organizationId: string,
  organizationName: string,
  data: OrganizationSnapshot["data"]
): OrganizationSnapshot {
  const totalRecords =
    data.floors.length +
    data.rooms.length +
    data.beds.length +
    data.tenants.length +
    data.invoices.length +
    data.payments.length +
    data.settings.length;

  const financialTotal = data.invoices.reduce(
    (sum, inv) => sum + (typeof inv.totalAmount === "number" ? inv.totalAmount : 0),
    0
  );

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    organizationId,
    organizationName,
    data,
    checksums: { totalRecords, financialTotal },
  };
}

/**
 * Validates the referential integrity of a snapshot.
 * Ensures every child record references a valid parent.
 */
export function validateSnapshotIntegrity(snapshot: OrganizationSnapshot): IntegrityReport {
  const errors: string[] = [];
  const floorIds = new Set(snapshot.data.floors.map((f) => f.id));
  const roomIds = new Set(snapshot.data.rooms.map((r) => r.id));
  const bedIds = new Set(snapshot.data.beds.map((b) => b.id));
  const tenantIds = new Set(snapshot.data.tenants.map((t) => t.id));
  const invoiceIds = new Set(snapshot.data.invoices.map((i) => i.id));

  // Rooms must reference valid floors
  for (const room of snapshot.data.rooms) {
    if (typeof room.floorId === "string" && !floorIds.has(room.floorId)) {
      errors.push(`Room ${room.id} references non-existent floor ${room.floorId}`);
    }
  }

  // Beds must reference valid rooms
  for (const bed of snapshot.data.beds) {
    if (typeof bed.roomId === "string" && !roomIds.has(bed.roomId)) {
      errors.push(`Bed ${bed.id} references non-existent room ${bed.roomId}`);
    }
  }

  // Tenants must reference valid beds
  for (const tenant of snapshot.data.tenants) {
    if (typeof tenant.bedId === "string" && !bedIds.has(tenant.bedId)) {
      errors.push(`Tenant ${tenant.id} references non-existent bed ${tenant.bedId}`);
    }
  }

  // Invoices must reference valid tenants
  for (const invoice of snapshot.data.invoices) {
    if (typeof invoice.tenantId === "string" && !tenantIds.has(invoice.tenantId)) {
      errors.push(`Invoice ${invoice.id} references non-existent tenant ${invoice.tenantId}`);
    }
  }

  // Payments must reference valid invoices
  for (const payment of snapshot.data.payments) {
    if (typeof payment.invoiceId === "string" && !invoiceIds.has(payment.invoiceId)) {
      errors.push(`Payment ${payment.id} references non-existent invoice ${payment.invoiceId}`);
    }
  }

  // Verify checksum
  const actualTotal =
    snapshot.data.floors.length +
    snapshot.data.rooms.length +
    snapshot.data.beds.length +
    snapshot.data.tenants.length +
    snapshot.data.invoices.length +
    snapshot.data.payments.length +
    snapshot.data.settings.length;

  if (actualTotal !== snapshot.checksums.totalRecords) {
    errors.push(`Record count mismatch: expected ${snapshot.checksums.totalRecords}, found ${actualTotal}`);
  }

  const actualFinancialTotal = snapshot.data.invoices.reduce(
    (sum, inv) => sum + (typeof inv.totalAmount === "number" ? inv.totalAmount : 0),
    0
  );

  if (Math.abs(actualFinancialTotal - snapshot.checksums.financialTotal) > 0.01) {
    errors.push(`Financial total mismatch: expected ₹${snapshot.checksums.financialTotal}, found ₹${actualFinancialTotal}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    recordCounts: {
      floors: snapshot.data.floors.length,
      rooms: snapshot.data.rooms.length,
      beds: snapshot.data.beds.length,
      tenants: snapshot.data.tenants.length,
      invoices: snapshot.data.invoices.length,
      payments: snapshot.data.payments.length,
      settings: snapshot.data.settings.length,
    },
  };
}

/**
 * Restores a snapshot into a new in-memory state.
 * Returns a deep clone of the data for isolation verification.
 */
export function restoreFromSnapshot(snapshot: OrganizationSnapshot): OrganizationSnapshot["data"] {
  return JSON.parse(JSON.stringify(snapshot.data));
}

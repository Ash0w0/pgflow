import assert from "node:assert/strict";
import test from "node:test";
import {
  PII_FIELDS,
  ALL_PII_FIELD_NAMES,
  RETENTION_POLICY,
  maskPhone,
  maskName,
  maskPii,
  financialRetentionExpiry,
  piiRetentionExpiry,
  isExpired,
} from "../../lib/privacy.ts";

test("PII registry covers all expected tables", () => {
  const registeredTables = Object.keys(PII_FIELDS);
  // Every table that holds resident/user PII must be registered
  assert.ok(registeredTables.includes("tenants"), "tenants table must be registered");
  assert.ok(registeredTables.includes("memberships"), "memberships table must be registered");
  assert.ok(registeredTables.includes("owner_invitations"), "owner_invitations table must be registered");
  assert.ok(registeredTables.includes("whatsapp_message_logs"), "whatsapp_message_logs must be registered");
  assert.ok(ALL_PII_FIELD_NAMES.length > 0, "PII field list must not be empty");
});

test("PII registry includes phone and name fields for tenants", () => {
  const tenantFields = PII_FIELDS.tenants;
  assert.ok(tenantFields.includes("full_name"), "full_name must be registered");
  assert.ok(tenantFields.includes("phone"), "phone must be registered");
  assert.ok(tenantFields.includes("alternate_phone"), "alternate_phone must be registered");
  assert.ok(tenantFields.includes("emergency_contact_name"), "emergency_contact_name must be registered");
  assert.ok(tenantFields.includes("emergency_contact_phone"), "emergency_contact_phone must be registered");
  assert.ok(tenantFields.includes("address"), "address must be registered");
});

test("maskPhone redacts phone numbers correctly", () => {
  assert.equal(maskPhone("+919876543210"), "+91 •••••• 3210");
  assert.equal(maskPhone("9876543210"), "+91 •••••• 3210");
  assert.equal(maskPhone(""), "Phone unavailable");
});

test("maskName redacts names correctly", () => {
  assert.equal(maskName("Mira Kapoor"), "M•••• K••••");
  assert.equal(maskName("Kavya"), "K••••");
  assert.equal(maskName(""), "Name unavailable");
  assert.equal(maskName("  "), "Name unavailable");
});

test("maskPii redacts all PII fields in a record", () => {
  const record = {
    id: "test_123",
    full_name: "Mira Kapoor",
    phone: "+919876543210",
    address: "42 MG Road, Bangalore",
    monthly_rent: 8500,
    app_name: "Sample PG", // should NOT be masked
  };

  const masked = maskPii(record);

  // PII fields are masked
  assert.notEqual(masked.full_name, "Mira Kapoor");
  assert.notEqual(masked.phone, "+919876543210");
  assert.equal(masked.address, "•••• (redacted)");

  // Non-PII fields pass through
  assert.equal(masked.id, "test_123");
  assert.equal(masked.monthly_rent, 8500);
  assert.equal(masked.app_name, "Sample PG"); // app_name is excluded from masking
});

test("retention periods comply with Indian tax law minimums", () => {
  // Financial records: 8 years per Income Tax Act
  assert.equal(RETENTION_POLICY.financialRecords.retentionYears, 8);
  assert.ok(RETENTION_POLICY.financialRecords.retentionYears >= 8, "Financial retention must be >= 8 years");

  // PII: 3 years post-departure
  assert.equal(RETENTION_POLICY.personalData.retentionYears, 3);

  // Audit logs: indefinite
  assert.equal(RETENTION_POLICY.auditLogs.retentionYears, null);
});

test("financialRetentionExpiry calculates 8-year window", () => {
  const created = new Date("2026-07-01T00:00:00Z");
  const expiry = financialRetentionExpiry(created);
  assert.equal(expiry.getFullYear(), 2034);
  assert.equal(expiry.getMonth(), 6); // July = month 6
});

test("piiRetentionExpiry calculates 3-year window from departure", () => {
  const departed = new Date("2026-07-15T00:00:00Z");
  const expiry = piiRetentionExpiry(departed);
  assert.equal(expiry.getFullYear(), 2029);
});

test("isExpired correctly identifies past-window records", () => {
  const pastExpiry = new Date("2020-01-01");
  const futureExpiry = new Date("2030-01-01");
  const now = new Date("2026-07-22");

  assert.equal(isExpired(pastExpiry, now), true);
  assert.equal(isExpired(futureExpiry, now), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateByOccupantDays,
  calculateDepositSettlement,
  calculateElectricity,
  createUpiUri,
  isValidPropertySlug,
  isValidUtr,
  normalizeUtr,
} from "../../lib/domain.ts";
import { BLANK_TEMPLATE, createCanonicalDemoSeed } from "../../lib/template.ts";
import { isApprovedHostname, resolveApprovedBrand } from "../../lib/branding.ts";

test("normalizes and validates payment references", () => {
  assert.equal(normalizeUtr(" demo 4829-1073 "), "DEMO4829-1073");
  assert.equal(isValidUtr(" demo 4829-1073 "), true);
  assert.equal(isValidUtr("short"), false);
});

test("calculates electricity and rejects backward readings", () => {
  assert.deepEqual(calculateElectricity(1220, 1278, 8.5), { units: 58, amount: 493 });
  assert.throws(() => calculateElectricity(1278, 1220, 8.5), /below/);
});

test("occupant-day allocation is exact and never negative", () => {
  const allocation = allocateByOccupantDays(0.02, { a: 1, b: 1, c: 1, d: 1 });
  assert.equal(Object.values(allocation).reduce((sum, value) => sum + value, 0), 0.02);
  assert.ok(Object.values(allocation).every((value) => value >= 0));
  assert.deepEqual(allocateByOccupantDays(900, { a: 30, b: 15, c: 15 }), { a: 450, b: 225, c: 225 });
});

test("settles deposits without returning a negative refund", () => {
  assert.equal(calculateDepositSettlement({ refundableDeposit: 12000, unpaidRent: 2500, finalElectricity: 500, approvedDeductions: 1000 }), 8000);
  assert.equal(calculateDepositSettlement({ refundableDeposit: 1000, unpaidRent: 3000, finalElectricity: 0, approvedDeductions: 0 }), 0);
});

test("builds only validated UPI URIs", () => {
  assert.match(createUpiUri({ upiId: "nivasa@okaxis", payeeName: "Nivasa", amount: 8500, reference: "INV-0726" }), /^upi:\/\/pay\?/);
  assert.throws(() => createUpiUri({ upiId: "not-a-vpa", payeeName: "Nivasa", amount: 1, reference: "INV" }), /valid UPI/);
  assert.throws(() => createUpiUri({ upiId: "nivasa@okaxis", payeeName: "", amount: 1, reference: "INV" }), /Payee/);
});

test("validates safe property slugs", () => {
  assert.equal(isValidPropertySlug("aster-house"), true);
  assert.equal(isValidPropertySlug("-unsafe"), false);
  assert.equal(isValidPropertySlug("Unsafe Space"), false);
});

test("keeps the blank template empty and demo seed canonical", () => {
  const seed = createCanonicalDemoSeed();
  assert.equal(BLANK_TEMPLATE.businessData, false);
  assert.equal(BLANK_TEMPLATE.demoRecords, 0);
  assert.equal(seed.floors.length, 3);
  assert.equal(seed.rooms.length, 24);
  assert.equal(seed.beds.length, 60);
  assert.equal(seed.tenants.length, 48);
  assert.equal(new Set(seed.tenants.map((tenant) => tenant.bedId)).size, 48);
  assert.ok(seed.tenants.every((tenant) => tenant.phone.startsWith("+91000000")));
});

test("resolves branding only from an approved hostname map", () => {
  assert.equal(resolveApprovedBrand("iris.pgflow.app").shortName, "Iris");
  assert.equal(resolveApprovedBrand("unknown.example").organizationId, "org_demo_nivasa");
  assert.equal(isApprovedHostname("unknown.example"), false);
  assert.equal(isApprovedHostname("DEMO.PGFLOW.APP:443"), true);
});

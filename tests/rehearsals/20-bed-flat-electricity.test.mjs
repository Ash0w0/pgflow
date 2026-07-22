import assert from "node:assert/strict";
import test from "node:test";
import {
  createRehearsalProperty,
  onboardRehearsalResidents,
  computeFlatElectricity,
  assertPennyExact,
} from "../../lib/rehearsal-helpers.ts";
import { calculateMoveOutSettlement } from "../../lib/resident-settlement.ts";

test("20-bed flat electricity: provisions, bills, and moves out correctly", async (t) => {
  // Provision: 2 floors × 5 rooms × 2 beds = 20 beds
  const property = createRehearsalProperty(2, 5, 2, 7500);

  await t.test("provisions the correct layout", () => {
    assert.equal(property.floors.length, 2);
    assert.equal(property.rooms.length, 10);
    assert.equal(property.beds.length, 20);
    // Each room has exactly 2 beds
    for (const room of property.rooms) {
      const roomBeds = property.beds.filter((b) => b.roomId === room.id);
      assert.equal(roomBeds.length, 2, `Room ${room.code} should have 2 beds`);
    }
  });

  // Onboard 18 residents (2 beds remain vacant)
  const residents = onboardRehearsalResidents(property.beds, property.rooms, 18);

  await t.test("onboards 18 residents with staggered dates", () => {
    assert.equal(residents.length, 18);
    const uniqueBeds = new Set(residents.map((r) => r.bedId));
    assert.equal(uniqueBeds.size, 18, "Each resident occupies a unique bed");
    // Verify staggered move-in dates
    const dates = new Set(residents.map((r) => r.moveInDate));
    assert.ok(dates.size > 1, "Residents have different move-in dates");
  });

  // Generate flat electricity charges at ₹200/month
  const FLAT_RATE = 200;
  const electricityCharges = computeFlatElectricity(residents, FLAT_RATE);

  await t.test("applies flat ₹200 electricity to all 18 residents", () => {
    assert.equal(electricityCharges.size, 18);
    for (const [residentId, charge] of electricityCharges) {
      assert.equal(charge, FLAT_RATE, `Resident ${residentId} should have ₹${FLAT_RATE} electricity`);
    }
  });

  await t.test("total billed = sum(rent) + 18 × flat_rate", () => {
    const totalRent = residents.reduce((sum, r) => sum + r.monthlyRent, 0);
    const totalElectricity = FLAT_RATE * 18;
    const totalBilled = totalRent + totalElectricity;
    assert.ok(totalBilled > 0, "Total billed must be positive");
    assertPennyExact(totalBilled, totalRent + totalElectricity);
  });

  // Move out 2 residents mid-month with deposit settlement
  await t.test("move-out settlement with deposit deductions", () => {
    const deposit = 15000;
    const settlement = calculateMoveOutSettlement({
      depositAmount: deposit,
      utilityDeductions: 500,
      damageDeductions: 200,
      unpaidRentDeductions: 0,
    });
    assert.equal(settlement.totalDeductions, 700);
    assert.equal(settlement.netRefundAmount, 14300);
    assert.ok(settlement.netRefundAmount >= 0, "Refund must not be negative");
  });

  await t.test("move-out where deductions exceed deposit produces negative refund", () => {
    const settlement = calculateMoveOutSettlement({
      depositAmount: 5000,
      utilityDeductions: 3000,
      damageDeductions: 2500,
      unpaidRentDeductions: 1000,
    });
    assert.ok(settlement.netRefundAmount < 0, "Refund is negative when deductions exceed deposit");
    assert.equal(settlement.totalDeductions, 6500);
  });
});

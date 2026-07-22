import assert from "node:assert/strict";
import test from "node:test";
import {
  createRehearsalProperty,
  onboardRehearsalResidents,
  computeSharedMeterElectricity,
  assertPennyExact,
} from "../../lib/rehearsal-helpers.ts";

test("200-bed shared meter: provisions, allocates by occupant-days, and verifies penny-exact", async (t) => {
  // Provision: 5 floors × 20 rooms × 2 beds = 200 beds
  const property = createRehearsalProperty(5, 20, 2, 7000);

  await t.test("provisions the correct 200-bed layout", () => {
    assert.equal(property.floors.length, 5);
    assert.equal(property.rooms.length, 100);
    assert.equal(property.beds.length, 200);
  });

  // Onboard 180 residents with staggered dates across the month
  const residents = onboardRehearsalResidents(property.beds, property.rooms, 180, 2026, 7, 28);

  await t.test("onboards 180 residents with staggered move-in dates", () => {
    assert.equal(residents.length, 180);
    const uniqueBeds = new Set(residents.map((r) => r.bedId));
    assert.equal(uniqueBeds.size, 180);

    // Verify stagger: residents have different move-in dates
    const dates = [...new Set(residents.map((r) => r.moveInDate))].sort();
    assert.ok(dates.length > 1, "Staggered residents should have multiple move-in dates");
  });

  // Single shared meter reading: 5000 kWh consumed across the whole property
  const TOTAL_KWH = 5000;
  const RATE_PER_UNIT = 8.5;
  const PERIOD_START = "2026-07-01";
  const PERIOD_END = "2026-07-31";

  const charges = computeSharedMeterElectricity(
    residents,
    TOTAL_KWH,
    RATE_PER_UNIT,
    PERIOD_START,
    PERIOD_END
  );

  await t.test("produces charges for all 180 residents", () => {
    assert.equal(charges.size, 180, "Every resident should have a charge");
  });

  await t.test("total allocated equals total meter charge (penny-exact)", () => {
    const totalMeterCharge = Math.round(TOTAL_KWH * RATE_PER_UNIT * 100) / 100;
    let totalAllocated = 0;
    for (const charge of charges.values()) {
      totalAllocated += charge;
    }
    // Round to 2 decimal places for comparison
    totalAllocated = Math.round(totalAllocated * 100) / 100;
    assertPennyExact(totalMeterCharge, totalAllocated);
  });

  await t.test("no resident receives a negative charge", () => {
    for (const [residentId, charge] of charges) {
      assert.ok(charge >= 0, `Resident ${residentId} has negative charge ₹${charge}`);
    }
  });

  await t.test("late move-in residents pay less than full-month residents", () => {
    // Find a resident who moved in on day 1 vs day 25
    const day1Resident = residents.find((r) => r.moveInDate.endsWith("-01"));
    const day25Resident = residents.find((r) => r.moveInDate.endsWith("-25"));

    if (day1Resident && day25Resident) {
      const charge1 = charges.get(day1Resident.id) ?? 0;
      const charge25 = charges.get(day25Resident.id) ?? 0;
      assert.ok(
        charge25 < charge1,
        `Day-25 resident (₹${charge25}) should pay less than day-1 resident (₹${charge1})`
      );
    }
  });

  await t.test("occupant-day ratio is proportional for day-25 move-in", () => {
    const day1Resident = residents.find((r) => r.moveInDate.endsWith("-01"));
    const day25Resident = residents.find((r) => r.moveInDate.endsWith("-25"));

    if (day1Resident && day25Resident) {
      const charge1 = charges.get(day1Resident.id) ?? 0;
      const charge25 = charges.get(day25Resident.id) ?? 0;

      // Day-1 resident: 30 occupant-days. Day-25 resident: 6 occupant-days.
      // Ratio should be roughly 6/30 = 0.2
      const ratio = charge25 / charge1;
      assert.ok(ratio > 0.1 && ratio < 0.4, `Occupant-day ratio ${ratio.toFixed(3)} should be roughly 0.2`);
    }
  });

  await t.test("handles edge case: zero kWh produces zero charges", () => {
    const zeroCharges = computeSharedMeterElectricity(residents, 0, RATE_PER_UNIT, PERIOD_START, PERIOD_END);
    for (const charge of zeroCharges.values()) {
      assert.equal(charge, 0, "Zero kWh should produce zero charges");
    }
  });
});

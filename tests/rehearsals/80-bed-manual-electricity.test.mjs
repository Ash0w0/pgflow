import assert from "node:assert/strict";
import test from "node:test";
import {
  createRehearsalProperty,
  onboardRehearsalResidents,
  computeManualMeterElectricity,
  assertPennyExact,
} from "../../lib/rehearsal-helpers.ts";
import { calculateElectricity } from "../../lib/domain.ts";

test("80-bed manual electricity: provisions, meters, and splits correctly", async (t) => {
  // Provision: 4 floors × 10 rooms × 2 beds = 80 beds
  const property = createRehearsalProperty(4, 10, 2, 8000);

  await t.test("provisions the correct 80-bed layout", () => {
    assert.equal(property.floors.length, 4);
    assert.equal(property.rooms.length, 40);
    assert.equal(property.beds.length, 80);
  });

  // Onboard 72 residents (8 beds remain vacant)
  const residents = onboardRehearsalResidents(property.beds, property.rooms, 72);

  await t.test("onboards 72 residents into unique beds", () => {
    assert.equal(residents.length, 72);
    const uniqueBeds = new Set(residents.map((r) => r.bedId));
    assert.equal(uniqueBeds.size, 72);
  });

  // Generate meter readings for each room
  const RATE_PER_UNIT = 8.5;
  const readings = new Map();
  for (const room of property.rooms) {
    const previous = 1000 + Math.floor(Math.random() * 500);
    const current = previous + 30 + Math.floor(Math.random() * 70); // 30-100 units consumed
    readings.set(room.id, { previous, current });
  }

  await t.test("calculates per-room electricity from meter readings", () => {
    for (const [roomId, reading] of readings) {
      const result = calculateElectricity(reading.previous, reading.current, RATE_PER_UNIT);
      assert.ok(result.units >= 0, `Units for room ${roomId} must be non-negative`);
      assert.ok(result.amount >= 0, `Amount for room ${roomId} must be non-negative`);
      assert.equal(result.units, reading.current - reading.previous);
    }
  });

  // Compute charges split across shared rooms
  const charges = computeManualMeterElectricity(property.rooms, residents, readings, RATE_PER_UNIT);

  await t.test("splits electricity evenly across room occupants", () => {
    assert.ok(charges.size > 0, "Should produce charges");

    // For each room with residents, verify split
    for (const room of property.rooms) {
      const roomResidents = residents.filter((r) => r.roomId === room.id);
      if (roomResidents.length === 0) continue;

      const reading = readings.get(room.id);
      if (!reading) continue;

      const { amount: totalRoomCharge } = calculateElectricity(reading.previous, reading.current, RATE_PER_UNIT);
      const residentChargesSum = roomResidents.reduce((sum, r) => sum + (charges.get(r.id) ?? 0), 0);

      assertPennyExact(totalRoomCharge, residentChargesSum);
    }
  });

  await t.test("rejects backward meter readings", () => {
    assert.throws(
      () => calculateElectricity(1500, 1200, RATE_PER_UNIT),
      /below/,
      "Backward readings must throw"
    );
  });

  await t.test("no negative electricity charges exist", () => {
    for (const [residentId, charge] of charges) {
      assert.ok(charge >= 0, `Resident ${residentId} has negative charge ₹${charge}`);
    }
  });

  await t.test("total electricity charges are financially consistent", () => {
    let expectedTotal = 0;
    for (const room of property.rooms) {
      const reading = readings.get(room.id);
      if (!reading) continue;
      const roomResidents = residents.filter((r) => r.roomId === room.id);
      if (roomResidents.length === 0) continue;
      const { amount } = calculateElectricity(reading.previous, reading.current, RATE_PER_UNIT);
      expectedTotal += amount;
    }

    let actualTotal = 0;
    for (const charge of charges.values()) {
      actualTotal += charge;
    }

    assertPennyExact(expectedTotal, actualTotal);
  });
});

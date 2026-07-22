/**
 * Shared test utilities for synthetic provisioning rehearsals.
 * Generates deterministic property layouts and resident populations
 * for stress-testing billing and allocation pipelines.
 */

import { calculateElectricity, allocateByOccupantDays } from "./domain";

export interface RehearsalFloor {
  id: string;
  name: string;
  sortOrder: number;
}

export interface RehearsalRoom {
  id: string;
  floorId: string;
  code: string;
  capacity: number;
  monthlyRent: number;
}

export interface RehearsalBed {
  id: string;
  roomId: string;
  label: string;
}

export interface RehearsalResident {
  id: string;
  name: string;
  bedId: string;
  roomId: string;
  moveInDate: string;
  monthlyRent: number;
}

export interface RehearsalProperty {
  floors: RehearsalFloor[];
  rooms: RehearsalRoom[];
  beds: RehearsalBed[];
}

/**
 * Creates a deterministic property layout with the given dimensions.
 */
export function createRehearsalProperty(
  floorsCount: number,
  roomsPerFloor: number,
  bedsPerRoom: number,
  baseRent = 7500
): RehearsalProperty {
  const floors: RehearsalFloor[] = [];
  const rooms: RehearsalRoom[] = [];
  const beds: RehearsalBed[] = [];

  for (let f = 0; f < floorsCount; f++) {
    const floorId = `rehearsal_floor_${f}`;
    floors.push({ id: floorId, name: `Floor ${f + 1}`, sortOrder: f });

    for (let r = 0; r < roomsPerFloor; r++) {
      const roomId = `rehearsal_room_${f}_${r}`;
      const code = `F${f + 1}-R${String(r + 1).padStart(2, "0")}`;
      const rent = baseRent + f * 500 + r * 100;
      rooms.push({ id: roomId, floorId, code, capacity: bedsPerRoom, monthlyRent: rent });

      for (let b = 0; b < bedsPerRoom; b++) {
        beds.push({
          id: `rehearsal_bed_${f}_${r}_${b}`,
          roomId,
          label: `Bed ${b + 1}`,
        });
      }
    }
  }

  return { floors, rooms, beds };
}

/**
 * Creates a population of residents with staggered move-in dates.
 * @param beds - Available beds from createRehearsalProperty
 * @param rooms - Rooms to look up rent
 * @param count - Number of residents to create (must be <= beds.length)
 * @param year - Base year for move-in dates
 * @param month - Base month (1-12) for move-in dates
 * @param staggerDays - Spread move-in across this many days of the month
 */
export function onboardRehearsalResidents(
  beds: RehearsalBed[],
  rooms: RehearsalRoom[],
  count: number,
  year = 2026,
  month = 7,
  staggerDays = 28
): RehearsalResident[] {
  if (count > beds.length) throw new Error(`Cannot onboard ${count} residents into ${beds.length} beds.`);
  const roomMap = new Map(rooms.map((r) => [r.id, r]));

  return Array.from({ length: count }, (_, i) => {
    const bed = beds[i];
    const room = roomMap.get(bed.roomId);
    if (!room) throw new Error(`Room not found for bed ${bed.id}`);

    const day = (i % staggerDays) + 1;
    const moveInDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    return {
      id: `rehearsal_resident_${String(i).padStart(3, "0")}`,
      name: `Rehearsal Resident ${i + 1}`,
      bedId: bed.id,
      roomId: bed.roomId,
      moveInDate,
      monthlyRent: room.monthlyRent,
    };
  });
}

/**
 * Asserts that two financial amounts are penny-exact (within ₹0.01).
 */
export function assertPennyExact(expected: number, actual: number): void {
  const diff = Math.abs(expected - actual);
  if (diff > 0.01) {
    throw new Error(`Financial rounding leakage: expected ₹${expected}, got ₹${actual} (diff: ₹${diff})`);
  }
}

/**
 * Generates flat electricity charges for all residents.
 */
export function computeFlatElectricity(
  residents: RehearsalResident[],
  flatRate: number
): Map<string, number> {
  const charges = new Map<string, number>();
  for (const resident of residents) {
    charges.set(resident.id, flatRate);
  }
  return charges;
}

/**
 * Generates manual sub-meter electricity charges per room, split by occupants.
 */
export function computeManualMeterElectricity(
  rooms: RehearsalRoom[],
  residents: RehearsalResident[],
  readings: Map<string, { previous: number; current: number }>,
  ratePerUnit: number
): Map<string, number> {
  const charges = new Map<string, number>();

  for (const room of rooms) {
    const reading = readings.get(room.id);
    if (!reading) continue;

    const { units, amount } = calculateElectricity(reading.previous, reading.current, ratePerUnit);
    const roomResidents = residents.filter((r) => r.roomId === room.id);

    if (roomResidents.length === 0) continue;
    const perResident = Math.round((amount / roomResidents.length) * 100) / 100;
    const remainder = Math.round((amount - perResident * roomResidents.length) * 100) / 100;

    for (let i = 0; i < roomResidents.length; i++) {
      charges.set(roomResidents[i].id, perResident + (i === 0 ? remainder : 0));
    }
  }

  return charges;
}

/**
 * Generates shared-meter electricity charges split by occupant-days.
 */
export function computeSharedMeterElectricity(
  residents: RehearsalResident[],
  totalKwh: number,
  ratePerUnit: number,
  periodStart: string,
  periodEnd: string
): Map<string, number> {
  const totalAmount = Math.round(totalKwh * ratePerUnit * 100) / 100;
  const start = new Date(periodStart + "T00:00:00Z");
  const end = new Date(periodEnd + "T00:00:00Z");
  const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000);

  const occupantDays: Record<string, number> = {};
  for (const resident of residents) {
    const moveIn = new Date(resident.moveInDate + "T00:00:00Z");
    const effectiveStart = moveIn > start ? moveIn : start;
    const days = Math.max(0, Math.round((end.getTime() - effectiveStart.getTime()) / 86400000));
    occupantDays[resident.id] = days;
  }

  const allocation = allocateByOccupantDays(totalAmount, occupantDays);
  return new Map(Object.entries(allocation));
}

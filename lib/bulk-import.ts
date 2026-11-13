import { validateResidentOnboardingInput } from "./resident-onboarding-validation.ts";

export const MAX_IMPORT_ROOMS = 300;
export const MAX_IMPORT_RESIDENTS = 600;
export const MAX_IMPORT_BYTES = 512 * 1024;

export type ImportRoom = {
  row: number;
  floor: string;
  code: string;
  capacity: number;
  roomType: "single" | "double" | "triple" | "shared";
  defaultRent: number;
  state: "active" | "maintenance";
};

export type ImportResident = {
  row: number;
  fullName: string;
  phone: string;
  alternatePhone: string;
  emergencyName: string;
  emergencyPhone: string;
  address: string;
  roomCode: string;
  bedLabel: string;
  moveInDate: string;
  monthlyRent: number;
  depositPromised: number;
  openingDue: number;
};

export type ImportIssue = { file: "rooms" | "residents"; row: number; message: string };

/** RFC 4180 CSV: quoted fields, escaped quotes, CRLF/LF, optional BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else { quoted = false; }
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function records(csv: string) {
  const [header, ...body] = parseCsv(csv);
  if (!header) return { headers: [] as string[], rows: [] as Array<{ row: number; get: (...names: string[]) => string }> };
  const headers = header.map(normalizeHeader);
  return {
    headers,
    rows: body.map((cells, index) => ({
      row: index + 2, // spreadsheet row number, counting the header as row 1
      get: (...names: string[]) => {
        for (const name of names) {
          const position = headers.indexOf(name);
          if (position >= 0) return (cells[position] ?? "").trim();
        }
        return "";
      },
    })),
  };
}

function wholeRupees(value: string) {
  const cleaned = value.replace(/[₹,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.0+)?$/.test(cleaned)) return Number.NaN;
  return Number.parseInt(cleaned, 10);
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value.trim();
}

/** Accepts DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD. */
function isoDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : trimmed;
}

function roomType(value: string, capacity: number): ImportRoom["roomType"] {
  const text = value.toLowerCase();
  if (/single|1\s*sharing/.test(text)) return "single";
  if (/double|twin|2\s*sharing/.test(text)) return "double";
  if (/triple|3\s*sharing/.test(text)) return "triple";
  if (text) return "shared";
  return capacity === 1 ? "single" : capacity === 2 ? "double" : capacity === 3 ? "triple" : "shared";
}

export function bedLabel(value: string) {
  const trimmed = value.trim();
  const number = /^(?:bed\s*)?(\d{1,2})$/i.exec(trimmed);
  return number ? `Bed ${Number.parseInt(number[1], 10)}` : trimmed;
}

const ROOM_CODE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,19}$/;

export function parseRoomsCsv(csv: string): { rooms: ImportRoom[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const { headers, rows } = records(csv);
  if (rows.length === 0) return { rooms: [], issues };
  for (const required of ["floor", "room", "capacity"]) {
    if (!headers.includes(required)) issues.push({ file: "rooms", row: 1, message: `Missing the "${required}" column.` });
  }
  if (issues.length) return { rooms: [], issues };
  if (rows.length > MAX_IMPORT_ROOMS) {
    return { rooms: [], issues: [{ file: "rooms", row: 1, message: `Import at most ${MAX_IMPORT_ROOMS} rooms at a time.` }] };
  }

  const seen = new Set<string>();
  const rooms: ImportRoom[] = [];
  for (const record of rows) {
    const problems: string[] = [];
    const floor = record.get("floor").replace(/\s+/g, " ");
    const code = record.get("room", "room_code").replace(/\s+/g, " ");
    const capacity = Number(record.get("capacity", "beds"));
    const rent = wholeRupees(record.get("monthly_rent", "rent", "default_rent"));
    const state = record.get("initial_state", "state").toLowerCase();

    if (floor.length < 1 || floor.length > 60) problems.push("enter a floor name");
    if (!ROOM_CODE.test(code)) problems.push("room code must be 1–20 letters, numbers, spaces, dots or hyphens");
    else if (seen.has(code.toLowerCase())) problems.push(`room ${code} appears twice`);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) problems.push("capacity must be a whole number from 1 to 20");
    if (!Number.isFinite(rent) || rent < 0 || rent > 10_000_000) problems.push("monthly rent must be a whole-rupee amount");
    if (state && !["vacant", "active", "maintenance", "occupied"].includes(state)) problems.push("initial_state must be vacant or maintenance");

    if (problems.length) {
      issues.push({ file: "rooms", row: record.row, message: problems.join("; ") });
      continue;
    }
    seen.add(code.toLowerCase());
    rooms.push({
      row: record.row,
      floor,
      code,
      capacity,
      roomType: roomType(record.get("room_type", "type"), capacity),
      defaultRent: rent,
      state: state === "maintenance" ? "maintenance" : "active",
    });
  }
  return { rooms, issues };
}

const FIELD_LABELS: Record<string, string> = {
  fullName: "name", phone: "phone", alternatePhone: "alternate phone", emergencyName: "emergency contact name",
  emergencyPhone: "emergency phone", address: "address", moveInDate: "move-in date", monthlyRent: "monthly rent",
  depositPromised: "deposit", openingDue: "opening due",
};

export function parseResidentsCsv(csv: string): { residents: ImportResident[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const { headers, rows } = records(csv);
  if (rows.length === 0) return { residents: [], issues };
  for (const required of ["full_name", "phone", "room", "bed", "move_in_date", "monthly_rent"]) {
    if (!headers.includes(required)) issues.push({ file: "residents", row: 1, message: `Missing the "${required}" column.` });
  }
  if (issues.length) return { residents: [], issues };
  if (rows.length > MAX_IMPORT_RESIDENTS) {
    return { residents: [], issues: [{ file: "residents", row: 1, message: `Import at most ${MAX_IMPORT_RESIDENTS} residents at a time.` }] };
  }

  const phones = new Set<string>();
  const beds = new Set<string>();
  const residents: ImportResident[] = [];
  for (const record of rows) {
    const resident: ImportResident = {
      row: record.row,
      fullName: record.get("full_name", "name").replace(/\s+/g, " "),
      phone: normalizePhone(record.get("phone")),
      alternatePhone: record.get("alternate_phone") ? normalizePhone(record.get("alternate_phone")) : "",
      emergencyName: record.get("emergency_name"),
      emergencyPhone: normalizePhone(record.get("emergency_phone")),
      address: record.get("address"),
      roomCode: record.get("room").replace(/\s+/g, " "),
      bedLabel: bedLabel(record.get("bed")),
      moveInDate: isoDate(record.get("move_in_date")),
      monthlyRent: wholeRupees(record.get("monthly_rent", "rent")),
      depositPromised: wholeRupees(record.get("deposit_received", "deposit", "deposit_promised")),
      openingDue: wholeRupees(record.get("opening_due")),
    };

    const fieldErrors = validateResidentOnboardingInput({
      fullName: resident.fullName,
      phone: resident.phone,
      alternatePhone: resident.alternatePhone,
      emergencyName: resident.emergencyName,
      emergencyPhone: resident.emergencyPhone,
      address: resident.address,
      bedId: "00000000-0000-4000-8000-000000000000",
      moveInDate: resident.moveInDate,
      monthlyRent: resident.monthlyRent,
      depositPromised: resident.depositPromised,
      openingDue: resident.openingDue,
      confirmAssignment: true,
    });
    const problems = Object.entries(fieldErrors).map(([field, message]) => `${FIELD_LABELS[field] ?? field}: ${message}`);
    if (!resident.roomCode) problems.push("enter the room");
    if (!/^Bed \d{1,2}$/.test(resident.bedLabel)) problems.push('bed must be a number like "1" or "Bed 1"');
    const bedKey = `${resident.roomCode.toLowerCase()}|${resident.bedLabel.toLowerCase()}`;
    if (phones.has(resident.phone)) problems.push(`phone ${resident.phone} appears twice`);
    if (beds.has(bedKey)) problems.push(`${resident.roomCode} ${resident.bedLabel} is assigned twice`);

    if (problems.length) {
      issues.push({ file: "residents", row: record.row, message: problems.join("; ") });
      continue;
    }
    phones.add(resident.phone);
    beds.add(bedKey);
    residents.push(resident);
  }
  return { residents, issues };
}

import test from "node:test";
import assert from "node:assert/strict";
import { bedLabel, parseCsv, parseResidentsCsv, parseRoomsCsv } from "../../lib/bulk-import.ts";

test("parses quoted CSV fields, escaped quotes, CRLF and a BOM", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
});

test("rooms: maps sharing labels, rejects duplicates and bad capacity with row numbers", () => {
  const { rooms, issues } = parseRoomsCsv([
    "Floor,Room,Capacity,Room Type,Monthly Rent,Initial State",
    "Ground,G-101,3,Triple sharing,\"7,500\",vacant",
    "Ground,G-102,2,Twin sharing,8500,maintenance",
    "Ground,G-101,1,Single,9000,vacant",
    "First,F-1,25,,9000,vacant",
  ].join("\n"));
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms[0], { row: 2, floor: "Ground", code: "G-101", capacity: 3, roomType: "triple", defaultRent: 7500, state: "active" });
  assert.equal(rooms[1].roomType, "double");
  assert.equal(rooms[1].state, "maintenance");
  assert.deepEqual(issues.map((issue) => issue.row), [4, 5]);
  assert.match(issues[0].message, /appears twice/);
  assert.match(issues[1].message, /capacity/);
});

test("rooms: a missing required column is reported once", () => {
  const { issues } = parseRoomsCsv("floor,capacity\nGround,2");
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /"room" column/);
});

test("residents: normalizes phones, Indian dates and bed numbers", () => {
  const { residents, issues } = parseResidentsCsv([
    "full_name,phone,emergency_name,emergency_phone,room,bed,move_in_date,monthly_rent,deposit_received,opening_due",
    "Asha Rao,98765 43210,Ravi Rao,9876543211,G-101,1,01/11/2026,7500,15000,500",
  ].join("\n"));
  assert.deepEqual(issues, []);
  assert.equal(residents[0].phone, "+919876543210");
  assert.equal(residents[0].bedLabel, "Bed 1");
  assert.equal(residents[0].moveInDate, "2026-11-01");
  assert.equal(residents[0].openingDue, 500);
});

test("residents: rejects duplicate phones, double-booked beds and invalid fields", () => {
  const header = "full_name,phone,emergency_name,emergency_phone,room,bed,move_in_date,monthly_rent";
  const { residents, issues } = parseResidentsCsv([
    header,
    "Asha Rao,9876543210,Ravi,9876543211,G-101,1,2026-11-01,7500",
    "Asha Again,9876543210,Ravi,9876543211,G-101,2,2026-11-01,7500",
    "Bina,9876543212,Ravi,9876543211,G-101,1,2026-11-01,7500",
    "C,123,,,G-101,x,not-a-date,-5",
  ].join("\n"));
  assert.equal(residents.length, 1);
  assert.deepEqual(issues.map((issue) => issue.row), [3, 4, 5]);
  assert.match(issues[0].message, /appears twice/);
  assert.match(issues[1].message, /assigned twice/);
  assert.match(issues[2].message, /phone/);
  assert.match(issues[2].message, /bed must be a number/);
});

test("bed labels accept numbers and existing labels", () => {
  assert.equal(bedLabel("2"), "Bed 2");
  assert.equal(bedLabel("bed 03"), "Bed 3");
  assert.equal(bedLabel("Upper"), "Upper");
});

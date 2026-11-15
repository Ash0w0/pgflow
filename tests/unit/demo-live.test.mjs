import assert from "node:assert/strict";
import test from "node:test";
import { handleDemoRequest } from "../../demo/live/api.ts";
import {
  demoCollectionsData,
  demoOverviewData,
  demoReportsData,
  demoResidentsData,
  demoRoomsData,
  getDemoState,
  indiaToday,
  resetDemo,
} from "../../demo/live/store.ts";

const call = (method, path, body = {}) => handleDemoRequest(method, path, body, "https://demo.example");

test("the demo PG starts as one consistent sample across every screen", () => {
  resetDemo();
  const rooms = demoRoomsData();
  const residents = demoResidentsData();
  const collections = demoCollectionsData();
  const overview = demoOverviewData();
  const reports = demoReportsData();

  assert.equal(rooms.totals.beds, 14);
  assert.equal(residents.residents.length, 10);
  assert.equal(overview.rooms.beds, rooms.totals.beds);
  assert.equal(overview.residents.activeResidents + overview.residents.noticeResidents, residents.residents.length);
  assert.equal(reports.occupancy.totalBeds, rooms.totals.beds);
  assert.equal(reports.occupancy.occupiedBeds, residents.residents.length);
  assert.equal(reports.collections.totalBilled, collections.totals.totalBilled);
  assert.equal(collections.totals.totalCollected + collections.totals.totalOutstanding, collections.totals.totalBilled);
  assert.equal(collections.pendingPayments.length, 2);
  assert.ok(collections.pendingPayments.every((payment) => payment.evidenceUrl));
  assert.equal(collections.totals.readyToGenerateCount, 0);
});

test("a visitor can set up rooms and onboard a resident without an account", () => {
  resetDemo();
  assert.equal(call("POST", "/api/rooms/setup", { action: "create_floor", name: "Terrace", sortOrder: 3 }).status, 201);
  assert.equal(call("POST", "/api/rooms/setup", { action: "create_floor", name: "terrace", sortOrder: 4 }).status, 409);
  const floorId = getDemoState().floors.at(-1).id;
  const room = { action: "create_room", floorId, code: "T-401", roomType: "double", capacity: 2, defaultRent: 9900, state: "active", confirmBedCreation: true };
  assert.equal(call("POST", "/api/rooms/setup", room).status, 201);
  assert.equal(call("POST", "/api/rooms/setup", room).status, 409);
  assert.equal(demoRoomsData().totals.beds, 16);

  const bedId = demoResidentsData().availableBeds.find((bed) => bed.roomCode === "T-401").id;
  const resident = {
    fullName: "Vikram Rao", phone: "9876500011", alternatePhone: "", emergencyName: "Mohan Rao", emergencyPhone: "9876500012", address: "",
    bedId, moveInDate: indiaToday().slice(0, 8) + "01", monthlyRent: 9900, depositPromised: 9900, openingDue: 1200, confirmAssignment: true,
  };
  assert.equal(call("POST", "/api/residents/onboard", { ...resident, phone: "12345" }).status, 400);
  assert.equal(call("POST", "/api/residents/onboard", resident).status, 201);
  assert.equal(call("POST", "/api/residents/onboard", resident).status, 409, "an occupied bed or repeated phone is refused");
  assert.equal(demoResidentsData().residents.length, 11);
  assert.equal(demoCollectionsData().totals.readyToGenerateCount, 1);
});

test("rent, payments and claims follow the same rules as the live product", () => {
  resetDemo();
  assert.equal(call("POST", "/api/billing/generate-monthly", { confirmGeneration: true }).body.result.generatedCount, 0, "rent is never billed twice");
  assert.equal(call("POST", "/api/billing/generate-monthly", {}).status, 400);

  const before = demoCollectionsData();
  const [first, second] = before.pendingPayments;
  assert.equal(call("POST", "/api/payments/review", { paymentId: first.id, decision: "approve", reason: "" }).status, 200);
  assert.equal(call("POST", "/api/payments/review", { paymentId: first.id, decision: "approve", reason: "" }).status, 400, "a payment is reviewed once");
  assert.equal(call("POST", "/api/payments/review", { paymentId: second.id, decision: "reject", reason: "" }).status, 400, "a rejection needs a reason");
  assert.equal(call("POST", "/api/payments/review", { paymentId: second.id, decision: "reject", reason: "amount_not_received" }).status, 200);
  const after = demoCollectionsData();
  assert.equal(after.pendingPayments.length, 0);
  assert.equal(after.totals.totalCollected, before.totals.totalCollected + first.amount);
  assert.ok(after.approvedPayments.find((payment) => payment.id === first.id).receiptNumber);

  const unpaid = after.invoices.find((invoice) => invoice.paidAmount === 0 && invoice.state !== "paid");
  const cash = (amount, collectedAt = new Date().toISOString()) => call("POST", "/api/payments/cash", { invoiceId: unpaid.id, amount, collectedAt, note: "cash" });
  assert.equal(cash(unpaid.totalAmount + 1).status, 400, "cash cannot exceed the balance");
  assert.equal(cash(100, new Date(Date.now() + 86_400_000).toISOString()).status, 400, "cash cannot be dated in the future");
  assert.equal(cash(unpaid.totalAmount).status, 201);
  assert.equal(demoCollectionsData().invoices.find((invoice) => invoice.id === unpaid.id).state, "paid");
  assert.equal(cash(1).status, 409, "a settled invoice takes no more money");

  const link = call("POST", "/api/payment-requests", { invoiceId: after.invoices.find((invoice) => invoice.state !== "paid" && invoice.id !== unpaid.id).id });
  assert.equal(link.status, 201);
  assert.match(link.body.url, /^https:\/\/demo\.example\/pay\//);

  assert.equal(call("POST", "/api/payments/claims", { paymentId: first.id, reason: "short" }).status, 400);
  assert.equal(call("POST", "/api/payments/claims", { paymentId: first.id, reason: "Approved the wrong resident" }).status, 201);
  assert.equal(call("POST", "/api/payments/claims", { paymentId: first.id, reason: "Approved the wrong resident" }).status, 409);
  const claim = demoCollectionsData().claims[0];
  const resolved = call("PATCH", "/api/payments/claims", { claimId: claim.id, decision: "uphold", note: "checked" });
  assert.match(resolved.body.claim.correctionInvoiceNumber, /^CORR-/);
  assert.ok(demoCollectionsData().invoices.some((invoice) => invoice.number === resolved.body.claim.correctionInvoiceNumber));
});

test("operations, team, settings and import all work in the demo", () => {
  resetDemo();
  assert.equal(call("POST", "/api/complaints", { roomNumber: "G-101", category: "banana", title: "x", priority: "low" }).status, 400);
  assert.equal(call("POST", "/api/complaints", { roomNumber: "G-101", category: "plumbing", title: "Geyser", priority: "high" }).status, 200);
  const ticket = getDemoState().tickets.at(-1);
  assert.equal(call("PATCH", `/api/complaints/${ticket.id}`, { status: "resolved" }).status, 200);
  assert.equal(call("PATCH", `/api/complaints/${ticket.id}`, { status: "nope" }).status, 400);

  const leaving = demoResidentsData().residents[0];
  assert.equal(call("POST", `/api/residents/${leaving.id}/move-out`, { exitDate: "2999-01-01" }).status, 400);
  assert.equal(call("POST", `/api/residents/${leaving.id}/move-out`, { exitDate: indiaToday() }).status, 200);
  assert.ok(!demoResidentsData().residents.some((resident) => resident.id === leaving.id));
  assert.ok(demoResidentsData().availableBeds.some((bed) => bed.id === leaving.bedId), "the bed is free again");

  const access = call("POST", `/api/residents/${demoResidentsData().residents[1].id}/app-access`, {});
  assert.equal(access.body.access, "active");
  assert.ok(access.body.credential.temporaryPassword);

  assert.equal(call("GET", "/api/team").body.managers.length, 1);
  assert.equal(call("POST", "/api/team", { name: "Sunita Devi", phone: "9876500099", currentPassword: "x" }).status, 201);
  assert.equal(call("POST", "/api/team", { name: "Sunita Devi", phone: "9876500099", currentPassword: "x" }).status, 409);

  assert.equal(call("PUT", "/api/settings/upi", { upiId: "not-a-upi", payeeName: "X" }).status, 400);
  assert.equal(call("PUT", "/api/settings/upi", { upiId: "owner@okaxis", payeeName: "Owner", notePrefix: "RENT" }).status, 200);
  assert.equal(getDemoState().settings.upiId, "owner@okaxis");

  const roomsCsv = "floor,room,capacity,room_type,monthly_rent,initial_state\nThird,X-501,2,Double sharing,9000,vacant\n";
  const residentsCsv = "full_name,phone,alternate_phone,emergency_name,emergency_phone,address,room,bed,move_in_date,monthly_rent,deposit_received,opening_due\nTara Joshi,9833300051,,Usha Joshi,9833300061,Pune,X-501,1,01-11-2026,9000,9000,500\n";
  const beds = demoRoomsData().totals.beds;
  const check = call("POST", "/api/import", { roomsCsv, residentsCsv, commit: false });
  assert.equal(check.body.summary.roomsCreated, 1);
  assert.equal(demoRoomsData().totals.beds, beds, "checking saves nothing");
  assert.equal(call("POST", "/api/import", { roomsCsv, residentsCsv, commit: true }).body.summary.residentsOnboarded, 1);
  assert.equal(demoRoomsData().totals.beds, beds + 2);
  assert.equal(call("POST", "/api/import", { roomsCsv: "", residentsCsv, commit: true }).status, 422, "a taken bed fails the whole import");

  assert.equal(call("POST", "/api/auth/update-password", {}).status, 403, "there are no accounts in the demo");
  assert.equal(call("GET", "/api/health"), null, "everything else goes to the server untouched");
});

test("a refresh brings back the untouched sample", () => {
  resetDemo();
  const fresh = JSON.stringify(demoOverviewData());
  call("POST", "/api/rooms/setup", { action: "create_floor", name: "Terrace", sortOrder: 3 });
  assert.notEqual(JSON.stringify(demoOverviewData()), fresh);
  resetDemo();
  assert.equal(JSON.stringify(demoOverviewData()), fresh);
});

test("a demo resident can send payment proof, and the owner then sees it to review", async () => {
  resetDemo();
  const { demoPaymentRequest } = await import("../../demo/live/store.ts");
  const unpaid = demoCollectionsData().invoices.find((invoice) => invoice.paidAmount === 0 && invoice.state !== "paid");
  const page = demoPaymentRequest(unpaid.id);
  assert.equal(page.amount, unpaid.totalAmount);
  assert.equal(page.upiUri, "", "the demo never produces a payable UPI link");
  assert.equal(demoPaymentRequest("00000000-0000-4000-8000-999999999999").invoiceId.length, 36, "an unknown link falls back to an unpaid sample bill");

  const upload = call("POST", "/api/uploads/payment-evidence");
  assert.equal(upload.status, 201);
  const proof = { invoiceId: unpaid.id, amount: page.amount, utr: "431812349999", paidAt: `${indiaToday()}T12:00:00+05:30`, objectKey: upload.body.objectKey, contentType: "image/png", fileHash: upload.body.hash, note: "" };
  assert.equal(call("POST", "/api/payments/evidence", { ...proof, utr: "x" }).status, 400);
  assert.equal(call("POST", "/api/payments/evidence", proof).status, 201);
  assert.equal(call("POST", "/api/payments/evidence", proof).status, 409, "the same UTR is refused");
  const pending = demoCollectionsData().pendingPayments.find((payment) => payment.reference === "431812349999");
  assert.ok(pending?.evidenceUrl);
});

test("adding a room creates its floor when the PG does not have that level yet", async () => {
  resetDemo();
  const { floorChoices, floorNameKey, PRESET_FLOORS } = await import("../../lib/floor-presets.ts");
  assert.equal(floorNameKey("First"), floorNameKey("1st Floor"));
  assert.equal(floorNameKey("Ground"), floorNameKey("Ground Floor"));
  assert.notEqual(floorNameKey("1st Floor"), floorNameKey("11th Floor"));

  const floorsBefore = getDemoState().floors.length;
  const choices = floorChoices(demoRoomsData().floors.map((floor) => ({ id: floor.id, name: floor.name, sortOrder: floor.sortOrder, roomCount: floor.rooms.length })));
  assert.equal(choices.length, PRESET_FLOORS.length, "the sample's floors map onto preset levels, with no duplicates");
  assert.equal(choices.filter((choice) => choice.floorId).length, floorsBefore);
  const renamed = floorChoices([{ id: "a", name: "First Floor", sortOrder: 5, roomCount: 2 }, { id: "b", name: "Annex", sortOrder: 9, roomCount: 1 }]);
  assert.equal(renamed.length, PRESET_FLOORS.length + 1);
  assert.equal(renamed.find((choice) => choice.floorId === "a").name, "First Floor", "an owner's own floor name is kept and fills the 1st-floor slot");
  assert.equal(renamed.at(-1).name, "Annex", "a custom floor stays available at the end");

  const room = (code, floor) => call("POST", "/api/rooms/setup", { action: "create_room", ...floor, code, roomType: "double", capacity: 2, defaultRent: 9000, state: "active", confirmBedCreation: true });
  assert.equal(room("T-1", { floor: { name: "Terrace", sortOrder: 12 } }).status, 201);
  assert.equal(getDemoState().floors.length, floorsBefore + 1, "the new level is created with the room");
  assert.equal(room("T-2", { floor: { name: "terrace", sortOrder: 12 } }).status, 201);
  assert.equal(getDemoState().floors.length, floorsBefore + 1, "the same level is never created twice");
  assert.equal(room("G-9", { floor: { name: "Ground", sortOrder: 1 } }).status, 201);
  assert.equal(getDemoState().floors.length, floorsBefore + 1, "'Ground' reuses the existing Ground Floor");
  assert.equal(room("X-1", {}).status, 400, "a room needs a floor");
  assert.equal(room("X-2", { floor: { name: "", sortOrder: 1 } }).status, 400);
});

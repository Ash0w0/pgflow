/**
 * In-browser stand-in for the PG API, used only by the public demo.
 *
 * Each handler applies the same rule the real server applies, but to the
 * in-memory demo store. No request leaves the visitor's tab.
 */
import { billingPeriodEnd, currentIndiaBillingPeriod } from "../../lib/billing-period.ts";
import { parseResidentsCsv, parseRoomsCsv } from "../../lib/bulk-import.ts";
import { floorNameKey } from "../../lib/floor-presets.ts";
import { validateResidentEditInput, validateResidentOnboardingInput } from "../../lib/resident-onboarding-validation.ts";
import {
  DEMO_PG_NAME,
  getDemoState,
  indiaToday,
  invoiceState,
  maskPhone,
  nextDemoId,
  updateDemo,
  type DemoInvoice,
  type DemoPayment,
  type DemoState,
} from "./store.ts";

export type DemoResponse = { status: number; body: unknown };
type Body = Record<string, unknown>;

const ok = (body: unknown, status = 200): DemoResponse => ({ status, body });
const fail = (error: string, status = 400): DemoResponse => ({ status, body: { error } });

const ROOM_TYPES = new Set(["single", "double", "triple", "shared"]);
const TICKET_CATEGORIES = new Set(["wifi", "plumbing", "electrical", "cleaning", "food", "other"]);
const TICKET_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const TICKET_STATUSES = new Set(["open", "in_progress", "resolved", "closed"]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return text(value);
}

function shortCode(id: string) {
  return id.slice(-6).toUpperCase();
}

function samplePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let value = "";
  for (let index = 0; index < 10; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `Demo-${value}`;
}

function approve(draft: DemoState, payment: DemoPayment) {
  const invoice = draft.invoices.find((entry) => entry.id === payment.invoiceId);
  payment.state = "approved";
  payment.approvedAt = new Date().toISOString();
  payment.receiptNumber = `RCP-${currentIndiaBillingPeriod().replace("-", "")}-${shortCode(payment.id)}`;
  if (invoice) invoice.paidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + payment.amount);
}

function openBalance(invoice: DemoInvoice) {
  return invoice.totalAmount - invoice.paidAmount;
}

// --- Rooms -----------------------------------------------------------------

function roomsSetup(body: Body): DemoResponse {
  const state = getDemoState();
  if (body.action === "create_floor") {
    const name = text(body.name);
    const sortOrder = Number(body.sortOrder);
    if (name.length < 1 || name.length > 80) return fail("Enter a floor name of up to 80 characters.");
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 200) return fail("Enter a display order between 0 and 200.");
    if (state.floors.some((floor) => floor.name.toLowerCase() === name.toLowerCase())) return fail("A floor with this name already exists.", 409);
    updateDemo((draft) => { draft.floors.push({ id: nextDemoId(), name, sortOrder }); });
    return ok({ created: true }, 201);
  }
  if (body.action === "create_room") {
    const code = text(body.code).toUpperCase();
    const capacity = Number(body.capacity);
    const defaultRent = Number(body.defaultRent);
    // A level picked from the wheel that the PG does not have yet is created with the room.
    const named = body.floor && typeof body.floor === "object" ? body.floor as Body : null;
    const namedName = text(named?.name);
    const namedOrder = Number(named?.sortOrder);
    const existingFloor = named
      ? state.floors.find((entry) => floorNameKey(entry.name) === floorNameKey(namedName))
      : state.floors.find((entry) => entry.id === body.floorId);
    if (!existingFloor && (!named || namedName.length < 1 || namedName.length > 60 || !Number.isInteger(namedOrder) || namedOrder < 0 || namedOrder > 999)) {
      return fail("Choose a floor for this room.");
    }
    if (!/^[A-Z0-9][A-Z0-9 -]{0,19}$/.test(code)) return fail("Enter a room code such as A-101.");
    if (!ROOM_TYPES.has(String(body.roomType))) return fail("Choose a room type.");
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) return fail("A room can have 1 to 20 beds.");
    if (!Number.isInteger(defaultRent) || defaultRent < 0 || defaultRent > 10_000_000) return fail("Enter a whole-rupee monthly rent.");
    if (state.rooms.some((room) => room.code === code)) return fail("A room with this code already exists.", 409);
    const roomState = body.state === "maintenance" ? "maintenance" : "active";
    updateDemo((draft) => {
      const floor = existingFloor ?? { id: nextDemoId(), name: namedName, sortOrder: namedOrder };
      if (!existingFloor) draft.floors.push(floor);
      const room = { id: nextDemoId(), floorId: floor.id, code, roomType: body.roomType as "single", capacity, defaultRent, state: roomState } as const;
      draft.rooms.push({ ...room });
      for (let index = 1; index <= capacity; index += 1) {
        draft.beds.push({ id: nextDemoId(), roomId: room.id, label: `Bed ${index}`, state: roomState === "maintenance" ? "maintenance" : "vacant" });
      }
    });
    return ok({ created: true }, 201);
  }
  return fail("That setup action is not available.");
}

// --- Residents -------------------------------------------------------------

function onboardResident(body: Body): DemoResponse {
  const fieldErrors = validateResidentOnboardingInput(body as never);
  if (Object.keys(fieldErrors).length > 0) return { status: 400, body: { error: "Please correct the highlighted fields.", fieldErrors } };
  const state = getDemoState();
  const phone = normalizePhone(body.phone);
  const bed = state.beds.find((entry) => entry.id === body.bedId);
  if (!bed || bed.state !== "vacant") return fail("The selected bed is no longer available.", 409);
  if (state.residents.some((resident) => resident.phone === phone && resident.state !== "moved_out")) {
    return fail("That resident phone number is already in this PG.", 409);
  }
  const openingDue = Number(body.openingDue) || 0;
  updateDemo((draft) => {
    const id = nextDemoId();
    draft.residents.push({
      id,
      bedId: bed.id,
      fullName: text(body.fullName),
      phone,
      alternatePhone: normalizePhone(body.alternatePhone),
      emergencyName: text(body.emergencyName),
      emergencyPhone: normalizePhone(body.emergencyPhone),
      address: text(body.address),
      moveInDate: text(body.moveInDate),
      monthlyRent: Number(body.monthlyRent),
      depositPromised: Number(body.depositPromised),
      state: "active",
      appAccess: "none",
      createdAt: Date.now(),
    });
    draft.beds.find((entry) => entry.id === bed.id)!.state = "occupied";
    if (openingDue > 0) {
      const invoiceId = nextDemoId();
      draft.invoices.push({ id: invoiceId, residentId: id, period: "opening", number: `OPEN-${shortCode(invoiceId)}`, dueDate: text(body.moveInDate), totalAmount: openingDue, paidAmount: 0, void: false });
    }
  });
  return ok({ onboarded: true }, 201);
}

function editResident(residentId: string, body: Body): DemoResponse {
  const state = getDemoState();
  const resident = state.residents.find((entry) => entry.id === residentId);
  if (!resident) return fail("That resident was not found.", 404);
  const fieldErrors = validateResidentEditInput(body as never);
  if (Object.keys(fieldErrors).length > 0) return { status: 400, body: { error: "Please correct the highlighted fields.", fieldErrors } };
  const phone = normalizePhone(body.phone);
  if (state.residents.some((entry) => entry.id !== residentId && entry.phone === phone && entry.state !== "moved_out")) {
    return fail("That resident phone number is already in this PG.", 409);
  }
  updateDemo((draft) => {
    const target = draft.residents.find((entry) => entry.id === residentId)!;
    target.fullName = text(body.fullName);
    target.phone = phone;
    target.alternatePhone = normalizePhone(body.alternatePhone);
    target.emergencyName = text(body.emergencyName);
    target.emergencyPhone = normalizePhone(body.emergencyPhone);
    target.address = text(body.address);
    target.moveInDate = text(body.moveInDate);
    target.monthlyRent = Number(body.monthlyRent);
    target.depositPromised = Number(body.depositPromised);
  });
  return ok({ updated: true });
}

function undoOnboarding(residentId: string, body: Body): DemoResponse {
  const state = getDemoState();
  const resident = state.residents.find((entry) => entry.id === residentId);
  if (!resident) return fail("That resident was not found.", 404);
  if (text(body.confirmationName).toLowerCase() !== resident.fullName.toLowerCase()) return fail("Type the resident's full name exactly to confirm.");
  if (Date.now() - resident.createdAt > 24 * 60 * 60 * 1000) return fail("Only a resident onboarded in the last 24 hours can be undone.", 409);
  if (state.invoices.some((invoice) => invoice.residentId === residentId) || state.payments.some((payment) => payment.residentId === residentId)) {
    return fail("This resident already has invoices or payments, so the onboarding cannot be undone.", 409);
  }
  updateDemo((draft) => {
    draft.residents = draft.residents.filter((entry) => entry.id !== residentId);
    const bed = draft.beds.find((entry) => entry.id === resident.bedId);
    if (bed) bed.state = "vacant";
  });
  return ok({ undone: true });
}

function appAccess(residentId: string, method: string, body: Body): DemoResponse {
  const resident = getDemoState().residents.find((entry) => entry.id === residentId);
  if (!resident) return fail("That resident was not found.", 404);
  const credential = { phone: resident.phone, temporaryPassword: samplePassword() };
  if (method === "POST") {
    updateDemo((draft) => { draft.residents.find((entry) => entry.id === residentId)!.appAccess = "active"; });
    return ok({ access: "active", credential }, 201);
  }
  if (body.action === "disable" || body.action === "enable") {
    const access = body.action === "disable" ? "disabled" : "active";
    updateDemo((draft) => { draft.residents.find((entry) => entry.id === residentId)!.appAccess = access; });
    return ok({ access });
  }
  if (body.action === "reset_password") return ok({ access: "active", credential });
  return fail("That app-access action is not available.");
}

function moveOut(residentId: string, body: Body): DemoResponse {
  const state = getDemoState();
  const resident = state.residents.find((entry) => entry.id === residentId);
  if (!resident || resident.state === "moved_out") return fail("That resident was not found.", 404);
  const exitDate = text(body.exitDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate)) return fail("Valid exit date is required.");
  if (exitDate > indiaToday()) return fail("The exit date cannot be in the future. Record the move-out on the day the resident leaves.");
  const deductions = ["utilityDeductions", "damageDeductions", "unpaidRentDeductions"].map((key) => Number(body[key] ?? 0));
  if (deductions.some((amount) => !Number.isFinite(amount) || amount < 0)) return fail("Deduction amounts must be non-negative numbers.");
  updateDemo((draft) => {
    const target = draft.residents.find((entry) => entry.id === residentId)!;
    target.state = "moved_out";
    target.appAccess = target.appAccess === "active" ? "disabled" : target.appAccess;
    const bed = draft.beds.find((entry) => entry.id === target.bedId);
    if (bed) bed.state = "vacant";
  });
  const netRefundAmount = resident.depositPromised - deductions.reduce((sum, amount) => sum + amount, 0);
  return ok({ ok: true, data: { state: "completed", exitDate, residentId, depositAmount: resident.depositPromised, netRefundAmount } });
}

// --- Rent and payments -----------------------------------------------------

function generateMonthly(body: Body): DemoResponse {
  if (body.confirmGeneration !== true) return fail("Confirm the monthly invoice generation first.");
  const period = currentIndiaBillingPeriod();
  const periodEnd = billingPeriodEnd(period);
  let generatedCount = 0;
  updateDemo((draft) => {
    const dueDate = `${period}-${String(draft.settings.dueDay).padStart(2, "0")}`;
    for (const resident of draft.residents) {
      if (resident.state !== "active" && resident.state !== "notice") continue;
      if (resident.moveInDate > periodEnd) continue;
      if (draft.invoices.some((invoice) => invoice.residentId === resident.id && invoice.period === period && !invoice.void)) continue;
      const id = nextDemoId();
      draft.invoices.push({ id, residentId: resident.id, period, number: `INV-${period.replace("-", "")}-${shortCode(id)}`, dueDate, totalAmount: resident.monthlyRent, paidAmount: 0, void: false });
      generatedCount += 1;
    }
  });
  return ok({ generated: true, result: { generatedCount, period } }, 201);
}

function payableInvoice(invoiceId: unknown) {
  const state = getDemoState();
  const invoice = state.invoices.find((entry) => entry.id === invoiceId);
  if (!invoice) return { error: fail("That invoice was not found.", 404) };
  if (!["issued", "partially_paid", "overdue"].includes(invoiceState(invoice))) return { error: fail("This invoice is already settled.", 409) };
  return { invoice };
}

function recordCash(body: Body): DemoResponse {
  const { invoice, error } = payableInvoice(body.invoiceId);
  if (!invoice) return error!;
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0) return fail("Cash details are invalid.");
  if (amount > openBalance(invoice)) return fail("Cash amount must not exceed the outstanding balance.");
  const collectedAt = Date.parse(text(body.collectedAt));
  if (Number.isNaN(collectedAt)) return fail("Cash details are invalid.");
  if (collectedAt > Date.now() + 10 * 60 * 1000) return fail("The collection time cannot be in the future.");
  if (getDemoState().payments.some((payment) => payment.invoiceId === invoice.id && payment.state === "pending_review")) {
    return fail("This invoice already has a payment awaiting review.", 409);
  }
  updateDemo((draft) => {
    const payment: DemoPayment = {
      id: nextDemoId(), invoiceId: invoice.id, residentId: invoice.residentId, method: "cash", amount, reference: "",
      paidAt: new Date(collectedAt).toISOString(), note: text(body.note).slice(0, 500), state: "pending_review", approvedAt: null, receiptNumber: null, hasProof: false,
    };
    draft.payments.push(payment);
    // The demo visitor is the owner, and owner-recorded cash is approved straight away.
    approve(draft, payment);
  });
  return ok({ recorded: true }, 201);
}

function reviewPayment(body: Body): DemoResponse {
  const payment = getDemoState().payments.find((entry) => entry.id === body.paymentId);
  if (!payment) return fail("That payment was not found.", 404);
  if (payment.state !== "pending_review") return fail("This payment is no longer pending review.");
  if (body.decision !== "approve" && body.decision !== "reject") return fail("Payment, decision and reason are required.");
  if (body.decision === "reject" && !text(body.reason)) return fail("Choose a reason for rejecting this payment.");
  updateDemo((draft) => {
    const target = draft.payments.find((entry) => entry.id === payment.id)!;
    if (body.decision === "approve") approve(draft, target);
    else target.state = "rejected";
  });
  return ok({ reviewed: true });
}

function paymentRequest(body: Body, origin: string): DemoResponse {
  const { invoice, error } = payableInvoice(body.invoiceId);
  if (!invoice) return error!;
  if (!getDemoState().settings.upiId) return fail("Add your UPI ID in Settings before sharing payment links.", 409);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return ok({ created: true, url: `${origin}/pay/${invoice.id}`, expiresAt }, 201);
}

function claims(method: string, body: Body): DemoResponse {
  const state = getDemoState();
  if (method === "POST") {
    const payment = state.payments.find((entry) => entry.id === body.paymentId && entry.state === "approved");
    const reason = text(body.reason);
    if (!payment) return fail("That approved payment was not found.", 404);
    if (reason.length < 10) return fail("Explain the mistake in at least 10 characters.");
    if (state.claims.some((claim) => claim.paymentId === payment.id && claim.state !== "dismissed")) {
      return fail("This payment already has an open or upheld claim.", 409);
    }
    updateDemo((draft) => {
      draft.claims.push({ id: nextDemoId(), paymentId: payment.id, reason, state: "open", raisedAt: new Date().toISOString(), resolutionNote: null, correctionInvoiceNumber: null });
    });
    return ok({ raised: true }, 201);
  }
  const claim = state.claims.find((entry) => entry.id === body.claimId);
  if (!claim || claim.state !== "open") return fail("That claim is no longer open.", 409);
  if (body.decision !== "uphold" && body.decision !== "dismiss") return fail("Choose to uphold or dismiss the claim.");
  let correctionInvoiceNumber: string | null = null;
  updateDemo((draft) => {
    const target = draft.claims.find((entry) => entry.id === claim.id)!;
    target.state = body.decision === "uphold" ? "upheld" : "dismissed";
    target.resolutionNote = text(body.note) || null;
    if (body.decision === "uphold") {
      const payment = draft.payments.find((entry) => entry.id === claim.paymentId)!;
      const id = nextDemoId();
      correctionInvoiceNumber = `CORR-${shortCode(id)}`;
      draft.invoices.push({ id, residentId: payment.residentId, period: "correction", number: correctionInvoiceNumber, dueDate: indiaToday(), totalAmount: payment.amount, paidAmount: 0, void: false });
      target.correctionInvoiceNumber = correctionInvoiceNumber;
    }
  });
  return ok({ resolved: true, claim: { state: body.decision === "uphold" ? "upheld" : "dismissed", correctionInvoiceNumber } });
}

function submitEvidence(body: Body): DemoResponse {
  const { invoice, error } = payableInvoice(body.invoiceId);
  if (!invoice) return error!;
  const utr = text(body.utr).replace(/\s/g, "").toUpperCase();
  const amount = Number(body.amount);
  if (!/^[A-Z0-9]{8,32}$/.test(utr) || !Number.isInteger(amount) || amount <= 0 || amount > openBalance(invoice)) return fail("Payment evidence is invalid.");
  const state = getDemoState();
  if (state.payments.some((payment) => payment.reference === utr && payment.state !== "rejected")) return fail("That UTR or screenshot was already submitted.", 409);
  if (state.payments.some((payment) => payment.invoiceId === invoice.id && payment.state === "pending_review")) return fail("This invoice already has a payment awaiting review.", 409);
  const paidAt = Number.isNaN(Date.parse(text(body.paidAt))) ? new Date().toISOString() : new Date(text(body.paidAt)).toISOString();
  updateDemo((draft) => {
    draft.payments.push({ id: nextDemoId(), invoiceId: invoice.id, residentId: invoice.residentId, method: "upi", amount, reference: utr, paidAt, note: text(body.note).slice(0, 500), state: "pending_review", approvedAt: null, receiptNumber: null, hasProof: true });
  });
  return ok({ submitted: true, payment: { state: "pending_review", autoApproved: false } }, 201);
}

// --- Operations ------------------------------------------------------------

function createTicket(body: Body): DemoResponse {
  const roomNumber = text(body.roomNumber);
  const title = text(body.title);
  const category = text(body.category);
  const priority = text(body.priority) || "medium";
  if (!roomNumber || !category || !title) return fail("Room number, category, and title are required.");
  if (!TICKET_CATEGORIES.has(category) || !TICKET_PRIORITIES.has(priority)) return fail("Choose a valid category and priority.");
  const now = new Date().toISOString();
  updateDemo((draft) => {
    draft.tickets.push({ id: nextDemoId(), organizationId: "demo", roomNumber, category: category as "other", title, description: text(body.description), status: "open", priority: priority as "medium", createdAt: now, updatedAt: now });
  });
  return ok({ ok: true });
}

function updateTicket(ticketId: string, body: Body): DemoResponse {
  const status = text(body.status);
  if (!TICKET_STATUSES.has(status)) return fail("Valid status (open, in_progress, resolved, closed) is required.");
  if (!getDemoState().tickets.some((ticket) => ticket.id === ticketId)) return fail("That ticket was not found.", 404);
  updateDemo((draft) => {
    const ticket = draft.tickets.find((entry) => entry.id === ticketId)!;
    ticket.status = status as "open";
    ticket.updatedAt = new Date().toISOString();
  });
  return ok({ ok: true });
}

// --- Settings and team -----------------------------------------------------

function saveUpi(body: Body): DemoResponse {
  const upiId = text(body.upiId);
  const payeeName = text(body.payeeName);
  if (!/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId)) return fail("Enter a valid UPI ID such as yourpg@bank.");
  if (payeeName.length < 2) return fail("Enter the payee name shown in UPI apps.");
  updateDemo((draft) => {
    draft.settings.upiId = upiId;
    draft.settings.payeeName = payeeName;
    draft.settings.notePrefix = text(body.notePrefix) || "RENT";
  });
  return ok({ saved: true });
}

function saveWhatsApp(body: Body): DemoResponse {
  updateDemo((draft) => {
    if (typeof body.autoReminders === "boolean") draft.settings.autoReminders = body.autoReminders;
    if (typeof body.autoReceipts === "boolean") draft.settings.autoReceipts = body.autoReceipts;
    if (body.language === "hi" || body.language === "en") draft.settings.language = body.language;
  });
  const { autoReminders, autoReceipts, language } = getDemoState().settings;
  return ok({ saved: true, settings: { autoReminders, autoReceipts, language } });
}

function team(method: string, body: Body): DemoResponse {
  const state = getDemoState();
  if (method === "GET") return ok({ managers: state.managers });
  if (method === "POST") {
    const name = text(body.name);
    const phone = normalizePhone(body.phone);
    if (name.length < 2) return fail("Enter the manager's name.");
    if (!/^\+91[6-9]\d{9}$/.test(phone)) return fail("Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9.");
    if (state.managers.some((manager) => manager.phone === phone)) return fail("This phone number already has a login in this PG.", 409);
    updateDemo((draft) => {
      draft.managers.push({ id: nextDemoId(), name, phone, maskedPhone: maskPhone(phone), state: "active", createdAt: new Date().toISOString() });
    });
    return ok({ created: true, credential: { phone, temporaryPassword: samplePassword() } }, 201);
  }
  const manager = state.managers.find((entry) => entry.id === body.membershipId);
  if (!manager) return fail("That manager was not found.", 404);
  if (body.action === "reset_password") return ok({ updated: true, credential: { phone: manager.phone, temporaryPassword: samplePassword() } });
  if (body.action === "disable" || body.action === "enable") {
    updateDemo((draft) => { draft.managers.find((entry) => entry.id === manager.id)!.state = body.action === "disable" ? "disabled" : "active"; });
    return ok({ updated: true });
  }
  return fail("That team action is not available.");
}

// --- Bulk import -----------------------------------------------------------

function bulkImport(body: Body): DemoResponse {
  const roomsCsv = typeof body.roomsCsv === "string" ? body.roomsCsv : "";
  const residentsCsv = typeof body.residentsCsv === "string" ? body.residentsCsv : "";
  if (typeof body.commit !== "boolean" || (!roomsCsv.trim() && !residentsCsv.trim())) return fail("Upload a rooms file, a residents file, or both.");
  const parsedRooms = parseRoomsCsv(roomsCsv);
  const parsedResidents = parseResidentsCsv(residentsCsv);
  const fileIssues = [...parsedRooms.issues, ...parsedResidents.issues];
  if (fileIssues.length > 0) return { status: 422, body: { ok: false, stage: "file", issues: fileIssues.slice(0, 200), issueCount: fileIssues.length } };
  if (parsedRooms.rooms.length === 0 && parsedResidents.residents.length === 0) return fail("The files have no data rows.");

  // Run the whole import on a copy first, so it saves all rows or none.
  const draft: DemoState = structuredClone(getDemoState());
  const summary = { floorsCreated: 0, roomsCreated: 0, roomsAlreadyPresent: 0, bedsCreated: 0, residentsOnboarded: 0, openingDueTotal: 0 };
  const created: string[] = [];
  const newId = () => { const id = nextDemoId(); created.push(id); return id; };
  for (const row of parsedRooms.rooms) {
    if (draft.rooms.some((room) => room.code.toLowerCase() === row.code.toLowerCase())) { summary.roomsAlreadyPresent += 1; continue; }
    let floor = draft.floors.find((entry) => entry.name.toLowerCase() === row.floor.toLowerCase());
    if (!floor) {
      floor = { id: newId(), name: row.floor, sortOrder: draft.floors.length };
      draft.floors.push(floor);
      summary.floorsCreated += 1;
    }
    const room = { id: newId(), floorId: floor.id, code: row.code, roomType: row.roomType, capacity: row.capacity, defaultRent: row.defaultRent, state: row.state };
    draft.rooms.push(room);
    summary.roomsCreated += 1;
    for (let index = 1; index <= row.capacity; index += 1) {
      draft.beds.push({ id: newId(), roomId: room.id, label: `Bed ${index}`, state: row.state === "maintenance" ? "maintenance" : "vacant" });
      summary.bedsCreated += 1;
    }
  }
  for (const row of parsedResidents.residents) {
    const issue = (message: string): DemoResponse => ({ status: 422, body: { ok: false, stage: "database", issues: [{ file: "residents", row: row.row, message }], issueCount: 1, nothingSaved: true } });
    const room = draft.rooms.find((entry) => entry.code.toLowerCase() === row.roomCode.toLowerCase());
    if (!room) return issue(`Room ${row.roomCode} does not exist. Add it to the rooms file.`);
    const bed = draft.beds.find((entry) => entry.roomId === room.id && entry.label.toLowerCase() === row.bedLabel.toLowerCase());
    if (!bed) return issue(`${row.bedLabel} does not exist in room ${room.code}.`);
    if (bed.state !== "vacant") return issue("The selected bed is no longer available.");
    const phone = normalizePhone(row.phone);
    if (draft.residents.some((resident) => resident.phone === phone && resident.state !== "moved_out")) return issue("That resident phone number is already in this PG. (already exists in this PG)");
    const id = newId();
    draft.residents.push({
      id, bedId: bed.id, fullName: row.fullName, phone, alternatePhone: normalizePhone(row.alternatePhone), emergencyName: row.emergencyName,
      emergencyPhone: normalizePhone(row.emergencyPhone), address: row.address, moveInDate: row.moveInDate, monthlyRent: row.monthlyRent,
      depositPromised: row.depositPromised, state: "active", appAccess: "none", createdAt: Date.now(),
    });
    bed.state = "occupied";
    summary.residentsOnboarded += 1;
    if (row.openingDue > 0) {
      const invoiceId = newId();
      draft.invoices.push({ id: invoiceId, residentId: id, period: "opening", number: `OPEN-${shortCode(invoiceId)}`, dueDate: row.moveInDate, totalAmount: row.openingDue, paidAmount: 0, void: false });
      summary.openingDueTotal += row.openingDue;
    }
  }
  if (body.commit) updateDemo((live) => { Object.assign(live, draft); });
  return ok({ ok: true, committed: body.commit, summary });
}

// --- Router ----------------------------------------------------------------

/**
 * Answers one PG API request from the demo store, or returns null when the
 * request is not part of the demo (it then goes to the server as usual).
 */
export function handleDemoRequest(method: string, pathname: string, body: Body, origin: string): DemoResponse | null {
  const residentMatch = /^\/api\/residents\/([0-9a-f-]{36})(\/(app-access|move-out))?$/.exec(pathname);
  if (residentMatch) {
    const [, residentId, , child] = residentMatch;
    if (child === "app-access") return appAccess(residentId, method, body);
    if (child === "move-out" && method === "POST") return moveOut(residentId, body);
    if (!child && method === "PATCH") return editResident(residentId, body);
    if (!child && method === "DELETE") return undoOnboarding(residentId, body);
    return null;
  }
  const ticketMatch = /^\/api\/complaints\/([0-9a-f-]{36})$/.exec(pathname);
  if (ticketMatch && method === "PATCH") return updateTicket(ticketMatch[1], body);

  switch (`${method} ${pathname}`) {
    case "POST /api/rooms/setup": return roomsSetup(body);
    case "POST /api/residents/onboard": return onboardResident(body);
    case "POST /api/billing/generate-monthly": return generateMonthly(body);
    case "POST /api/payments/cash": return recordCash(body);
    case "POST /api/payments/review": return reviewPayment(body);
    case "POST /api/payment-requests": return paymentRequest(body, origin);
    // The screenshot itself stays on the visitor's device; only the fact that one was attached is kept.
    case "POST /api/uploads/payment-evidence": return ok({ objectKey: "demo/payment-proof", hash: "0".repeat(64), contentType: "image/png", size: 1 }, 201);
    case "POST /api/payments/evidence": return submitEvidence(body);
    case "POST /api/payments/claims":
    case "PATCH /api/payments/claims": return claims(method, body);
    case "POST /api/complaints": return createTicket(body);
    case "PUT /api/settings/upi": return saveUpi(body);
    case "PUT /api/settings/whatsapp": return saveWhatsApp(body);
    case "PUT /api/settings/branding": return ok({ saved: true });
    case "POST /api/uploads/upi-qr": return ok({ objectKey: "demo/upi-qr", uploaded: true }, 201);
    case "GET /api/team":
    case "POST /api/team":
    case "PATCH /api/team": return team(method, body);
    case "POST /api/import": return bulkImport(body);
    case "POST /api/auth/update-password":
      return fail(`Passwords are switched off in the demo. ${DEMO_PG_NAME} has no real accounts.`, 403);
    default: return null;
  }
}

/**
 * The demo PG lives entirely in the visitor's browser tab.
 *
 * Every screen reads from this one in-memory store and every action writes to
 * it, so a visitor can add rooms, onboard residents, generate rent, approve
 * payments and so on without an account. Nothing is sent to a server, and a
 * page refresh starts again from the same sample PG.
 */
import { billingPeriodEnd, billingPeriodLabel, currentIndiaBillingPeriod } from "../../lib/billing-period.ts";
import type { CollectionsData } from "../../lib/collections-types.ts";
import type { LivePaymentRequest } from "../../lib/payment-request-data.ts";
import type { MaintenanceTicket, TicketCategory, TicketPriority, TicketStatus } from "../../lib/maintenance-tickets.ts";
import type { ReportsData } from "../../lib/reports-types.ts";
import type { ResidentSetupData } from "../../lib/resident-setup-types.ts";
import type { BedState, RoomSetupData } from "../../lib/room-setup-types.ts";

export const DEMO_PG_NAME = "PGFlow Sample";
export const DEMO_PROOF_URL = "/demo/payment-proof.svg";

export type DemoFloor = { id: string; name: string; sortOrder: number };
export type DemoRoom = {
  id: string;
  floorId: string;
  code: string;
  roomType: "single" | "double" | "triple" | "shared";
  capacity: number;
  defaultRent: number;
  state: "active" | "maintenance" | "inactive";
};
export type DemoBed = { id: string; roomId: string; label: string; state: BedState };
export type DemoResident = {
  id: string;
  bedId: string;
  fullName: string;
  phone: string;
  alternatePhone: string;
  emergencyName: string;
  emergencyPhone: string;
  address: string;
  moveInDate: string;
  monthlyRent: number;
  depositPromised: number;
  state: "active" | "notice" | "moved_out" | "archived";
  appAccess: "none" | "active" | "disabled";
  createdAt: number;
};
export type DemoInvoice = {
  id: string;
  residentId: string;
  period: string;
  number: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  void: boolean;
};
export type DemoPayment = {
  id: string;
  invoiceId: string;
  residentId: string;
  method: "upi" | "cash";
  amount: number;
  reference: string;
  paidAt: string;
  note: string;
  state: "pending_review" | "approved" | "rejected";
  approvedAt: string | null;
  receiptNumber: string | null;
  hasProof: boolean;
};
export type DemoClaim = {
  id: string;
  paymentId: string;
  reason: string;
  state: "open" | "upheld" | "dismissed";
  raisedAt: string;
  resolutionNote: string | null;
  correctionInvoiceNumber: string | null;
};
export type DemoManager = { id: string; name: string; phone: string; maskedPhone: string; state: string; createdAt: string };
export type DemoSettings = {
  upiId: string;
  payeeName: string;
  notePrefix: string;
  hasUploadedQr: boolean;
  autoReminders: boolean;
  autoReceipts: boolean;
  language: "en" | "hi";
  primaryColor: string;
  accentColor: string;
  dueDay: number;
};
export type DemoState = {
  floors: DemoFloor[];
  rooms: DemoRoom[];
  beds: DemoBed[];
  residents: DemoResident[];
  invoices: DemoInvoice[];
  payments: DemoPayment[];
  claims: DemoClaim[];
  tickets: MaintenanceTicket[];
  managers: DemoManager[];
  settings: DemoSettings;
};

let sequence = 0;

/** UUID-shaped, predictable ids so the server-rendered and browser copies of the seed match. */
export function nextDemoId() {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export function indiaToday(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `+91 •••••• ${digits.slice(-4)}`;
}

function shortCode(id: string) {
  return id.slice(-6).toUpperCase();
}

function dueDateFor(period: string, dueDay: number) {
  return `${period}-${String(dueDay).padStart(2, "0")}`;
}

function buildSeed(): DemoState {
  sequence = 0;
  const period = currentIndiaBillingPeriod();
  const dueDay = 5;
  const dueDate = dueDateFor(period, dueDay);
  const monthStart = `${period}-01`;
  const startedAt = Date.parse(`${monthStart}T04:30:00.000Z`);

  const state: DemoState = {
    floors: [],
    rooms: [],
    beds: [],
    residents: [],
    invoices: [],
    payments: [],
    claims: [],
    tickets: [],
    managers: [],
    settings: {
      // Not a real bank handle, so a visitor can never pay a stranger by accident.
      upiId: "sample@demopg",
      payeeName: DEMO_PG_NAME,
      notePrefix: "RENT",
      hasUploadedQr: false,
      autoReminders: true,
      autoReceipts: true,
      language: "en",
      primaryColor: "#123d32",
      accentColor: "#d7ff86",
      dueDay,
    },
  };

  const floorPlan: Array<[string, Array<[string, DemoRoom["roomType"], number, number, DemoRoom["state"]]>]> = [
    ["Ground Floor", [["G-101", "triple", 3, 7500, "active"], ["G-102", "double", 2, 8500, "active"]]],
    ["1st Floor", [["F-201", "single", 1, 12000, "active"], ["F-202", "double", 2, 9000, "active"], ["F-203", "triple", 3, 7800, "active"]]],
    ["2nd Floor", [["S-301", "double", 2, 9200, "active"], ["S-302", "single", 1, 11500, "maintenance"]]],
  ];
  floorPlan.forEach(([name, rooms], floorIndex) => {
    const floor = { id: nextDemoId(), name, sortOrder: floorIndex };
    state.floors.push(floor);
    for (const [code, roomType, capacity, defaultRent, roomState] of rooms) {
      const room = { id: nextDemoId(), floorId: floor.id, code, roomType, capacity, defaultRent, state: roomState };
      state.rooms.push(room);
      for (let index = 1; index <= capacity; index += 1) {
        state.beds.push({ id: nextDemoId(), roomId: room.id, label: `Bed ${index}`, state: roomState === "maintenance" ? "maintenance" : "vacant" });
      }
    }
  });

  const people: Array<[string, string, string, number, string, string]> = [
    // name, phone, room code, bed number, emergency contact, home town
    ["Aman Verma", "9810000101", "G-101", 1, "Suresh Verma", "Gaya, Bihar"],
    ["Kabir Khan", "9810000102", "G-101", 2, "Salim Khan", "Bhagalpur, Bihar"],
    ["Rohit Kumar", "9810000103", "G-101", 3, "Anil Kumar", "Darbhanga, Bihar"],
    ["Neha Singh", "9810000104", "G-102", 1, "Rita Singh", "Muzaffarpur, Bihar"],
    ["Sana Ali", "9810000105", "G-102", 2, "Farah Ali", "Patna City, Bihar"],
    ["Mira Kapoor", "9810000106", "F-201", 1, "Anita Kapoor", "Ranchi, Jharkhand"],
    ["Arjun Nair", "9810000107", "F-202", 1, "Suma Nair", "Kochi, Kerala"],
    ["Kavya Mehta", "9810000108", "F-203", 1, "Hema Mehta", "Surat, Gujarat"],
    ["Dev Sharma", "9810000109", "F-203", 2, "Ravi Sharma", "Jaipur, Rajasthan"],
    ["Ishaan Roy", "9810000110", "S-301", 1, "Mita Roy", "Kolkata, West Bengal"],
  ];
  for (const [fullName, phone, roomCode, bedNumber, emergencyName, address] of people) {
    const room = state.rooms.find((entry) => entry.code === roomCode)!;
    const bed = state.beds.find((entry) => entry.roomId === room.id && entry.label === `Bed ${bedNumber}`)!;
    bed.state = "occupied";
    state.residents.push({
      id: nextDemoId(),
      bedId: bed.id,
      fullName,
      phone: `+91${phone}`,
      alternatePhone: "",
      emergencyName,
      emergencyPhone: `+91${String(Number(phone) + 500)}`,
      address,
      moveInDate: "2026-06-01",
      monthlyRent: room.defaultRent,
      depositPromised: room.defaultRent,
      state: "active",
      appAccess: "none",
      createdAt: startedAt,
    });
  }
  state.residents[9].state = "notice";
  state.beds.find((bed) => bed.id === state.residents[9].bedId)!.state = "notice_period";
  state.residents[0].appAccess = "active";

  // This month's rent: five paid, two waiting for the owner to check, one part paid, two not paid yet.
  const paidAt = `${period}-03T06:10:00.000Z`;
  state.residents.forEach((resident, index) => {
    const invoice: DemoInvoice = {
      id: nextDemoId(),
      residentId: resident.id,
      period,
      number: "",
      dueDate,
      totalAmount: resident.monthlyRent,
      paidAmount: 0,
      void: false,
    };
    invoice.number = `INV-${period.replace("-", "")}-${shortCode(invoice.id)}`;
    state.invoices.push(invoice);

    const pay = (method: "upi" | "cash", amount: number, paymentState: DemoPayment["state"], reference: string, note = "") => {
      const payment: DemoPayment = {
        id: nextDemoId(),
        invoiceId: invoice.id,
        residentId: resident.id,
        method,
        amount,
        reference,
        paidAt,
        note,
        state: paymentState,
        approvedAt: paymentState === "approved" ? paidAt : null,
        receiptNumber: null,
        hasProof: method === "upi",
      };
      if (paymentState === "approved") {
        payment.receiptNumber = `RCP-${period.replace("-", "")}-${shortCode(payment.id)}`;
        invoice.paidAmount += amount;
      }
      state.payments.push(payment);
    };
    if (index < 3) pay("upi", invoice.totalAmount, "approved", `4318${String(22110000 + index)}`);
    else if (index < 5) pay("cash", invoice.totalAmount, "approved", "");
    else if (index < 7) pay("upi", invoice.totalAmount, "pending_review", `4318${String(33550000 + index)}`, index === 5 ? "Paid from my father's account" : "");
    else if (index === 7) pay("cash", 5000, "approved", "");
  });

  const ticket = (roomCode: string, category: TicketCategory, title: string, description: string, status: TicketStatus, priority: TicketPriority, residentIndex: number | null): MaintenanceTicket => {
    const id = nextDemoId();
    const createdAt = `${period}-02T05:00:00.000Z`;
    return {
      id,
      organizationId: "demo",
      residentId: residentIndex === null ? undefined : state.residents[residentIndex].id,
      roomNumber: roomCode,
      category,
      title,
      description,
      status,
      priority,
      createdAt,
      updatedAt: createdAt,
    };
  };
  state.tickets.push(
    ticket("G-101", "wifi", "Wi-Fi drops after 9 pm", "Router near the stairs keeps restarting.", "open", "high", 0),
    ticket("F-202", "plumbing", "Tap leaking near wash basin", "Slow leak since Monday.", "in_progress", "medium", 6),
    ticket("F-203", "electrical", "Tube light not working", "", "open", "low", 7),
    ticket("G-102", "cleaning", "Common bathroom needs cleaning", "", "resolved", "medium", 3),
  );

  state.managers.push({
    id: nextDemoId(),
    name: "Raju Yadav",
    phone: "+919810000200",
    maskedPhone: maskPhone("9810000200"),
    state: "active",
    createdAt: `${monthStart}T04:30:00.000Z`,
  });

  return state;
}

let state: DemoState = buildSeed();
let version = 0;
const listeners = new Set<() => void>();

export function getDemoState() {
  return state;
}

export function getDemoVersion() {
  return version;
}

/** The server always renders the untouched sample, so hydration matches a fresh tab. */
export function getServerDemoVersion() {
  return 0;
}

export function subscribeDemo(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply a change and tell every screen to re-render. */
export function updateDemo(change: (draft: DemoState) => void) {
  change(state);
  version += 1;
  for (const listener of listeners) listener();
}

export function resetDemo() {
  state = buildSeed();
  version += 1;
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Views: the same shapes the live database loaders return.
// ---------------------------------------------------------------------------

export function invoiceState(invoice: DemoInvoice, today = indiaToday()): CollectionsData["invoices"][number]["state"] {
  if (invoice.void) return "void";
  if (invoice.paidAmount >= invoice.totalAmount) return "paid";
  if (invoice.dueDate < today) return "overdue";
  return invoice.paidAmount > 0 ? "partially_paid" : "issued";
}

function placement(current: DemoState, bedId: string) {
  const bed = current.beds.find((entry) => entry.id === bedId);
  const room = bed ? current.rooms.find((entry) => entry.id === bed.roomId) : undefined;
  const floor = room ? current.floors.find((entry) => entry.id === room.floorId) : undefined;
  return { bed, room, floor };
}

export function roomLabelFor(current: DemoState, residentId: string) {
  const resident = current.residents.find((entry) => entry.id === residentId);
  if (!resident) return "";
  if (resident.state === "moved_out") return "Previous occupancy";
  const { bed, room } = placement(current, resident.bedId);
  return room && bed ? `${room.code} · ${bed.label}` : "";
}

export function demoRoomsData(current: DemoState = state): RoomSetupData {
  const floors = [...current.floors].sort((left, right) => left.sortOrder - right.sortOrder).map((floor) => ({
    id: floor.id,
    name: floor.name,
    sortOrder: floor.sortOrder,
    state: "active" as const,
    rooms: current.rooms.filter((room) => room.floorId === floor.id).map((room) => ({
      id: room.id,
      code: room.code,
      roomType: room.roomType,
      capacity: room.capacity,
      defaultRent: room.defaultRent,
      state: room.state,
      beds: current.beds.filter((bed) => bed.roomId === room.id).map((bed) => ({ id: bed.id, label: bed.label, rentOverride: null, state: bed.state })),
    })),
  }));
  return {
    floors,
    totals: {
      floors: current.floors.length,
      rooms: current.rooms.length,
      beds: current.beds.length,
      vacantBeds: current.beds.filter((bed) => bed.state === "vacant").length,
      maintenanceBeds: current.beds.filter((bed) => bed.state === "maintenance").length,
    },
  };
}

function outstandingFor(current: DemoState, residentId: string) {
  return current.invoices
    .filter((invoice) => invoice.residentId === residentId && !invoice.void)
    .reduce((sum, invoice) => sum + Math.max(0, invoice.totalAmount - invoice.paidAmount), 0);
}

export function demoResidentsData(current: DemoState = state): ResidentSetupData {
  const living = current.residents.filter((resident) => resident.state === "active" || resident.state === "notice");
  const availableBeds = current.beds.filter((bed) => bed.state === "vacant").flatMap((bed) => {
    const { room, floor } = placement(current, bed.id);
    if (!room || !floor || room.state !== "active") return [];
    return [{ id: bed.id, floorName: floor.name, roomCode: room.code, bedLabel: bed.label, defaultRent: room.defaultRent }];
  });
  const residents = living.map((resident) => {
    const { bed, room, floor } = placement(current, resident.bedId);
    return {
      id: resident.id,
      bedId: resident.bedId,
      fullName: resident.fullName,
      phone: resident.phone,
      alternatePhone: resident.alternatePhone,
      emergencyName: resident.emergencyName,
      emergencyPhone: resident.emergencyPhone,
      address: resident.address,
      floorName: floor?.name ?? "",
      roomCode: room?.code ?? "",
      bedLabel: bed?.label ?? "",
      moveInDate: resident.moveInDate,
      monthlyRent: resident.monthlyRent,
      depositPromised: resident.depositPromised,
      outstanding: outstandingFor(current, resident.id),
      state: resident.state,
      appAccess: resident.appAccess,
    };
  }).sort((left, right) => left.fullName.localeCompare(right.fullName));
  return {
    residentLimit: 100000,
    availableBeds,
    residents,
    totals: {
      activeResidents: living.filter((resident) => resident.state === "active").length,
      noticeResidents: living.filter((resident) => resident.state === "notice").length,
      availableBeds: availableBeds.length,
      totalOutstanding: residents.reduce((sum, resident) => sum + resident.outstanding, 0),
      depositsPromised: living.reduce((sum, resident) => sum + resident.depositPromised, 0),
    },
  };
}

export function demoCollectionsData(current: DemoState = state): CollectionsData {
  const period = currentIndiaBillingPeriod();
  const periodEnd = billingPeriodEnd(period);
  const today = indiaToday();
  const nameOf = (residentId: string) => current.residents.find((resident) => resident.id === residentId)?.fullName ?? "Resident";
  const billed = new Set(current.invoices.filter((invoice) => invoice.period === period && !invoice.void).map((invoice) => invoice.residentId));
  const preview = current.residents
    .filter((resident) => (resident.state === "active" || resident.state === "notice") && resident.moveInDate <= periodEnd)
    .map((resident) => ({
      tenantId: resident.id,
      residentName: resident.fullName,
      roomLabel: roomLabelFor(current, resident.id),
      rent: resident.monthlyRent,
      alreadyIssued: billed.has(resident.id),
    }))
    .sort((left, right) => left.residentName.localeCompare(right.residentName));
  const invoices = [...current.invoices].reverse().map((invoice) => ({
    id: invoice.id,
    residentName: nameOf(invoice.residentId),
    residentPhone: current.residents.find((resident) => resident.id === invoice.residentId)?.phone ?? "",
    roomLabel: roomLabelFor(current, invoice.residentId),
    period: invoice.period,
    number: invoice.number,
    dueDate: invoice.dueDate,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    state: invoiceState(invoice, today),
  }));
  const collectible = invoices.filter((invoice) => invoice.state !== "void");
  const ready = preview.filter((row) => !row.alreadyIssued);
  const claimFor = (paymentId: string) => {
    const claims = current.claims.filter((claim) => claim.paymentId === paymentId);
    return claims.find((claim) => claim.state === "open") ?? claims.find((claim) => claim.state === "upheld") ?? claims[0] ?? null;
  };
  return {
    period,
    periodLabel: billingPeriodLabel(period),
    dueDay: current.settings.dueDay,
    preview,
    invoices,
    upiConfigured: Boolean(current.settings.upiId && current.settings.payeeName),
    pendingPayments: current.payments.filter((payment) => payment.state === "pending_review").map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      residentName: nameOf(payment.residentId),
      method: payment.method,
      amount: payment.amount,
      reference: payment.reference || "—",
      paidAt: payment.paidAt,
      note: payment.note,
      evidenceUrl: payment.hasProof ? DEMO_PROOF_URL : null,
    })),
    approvedPayments: current.payments
      .filter((payment) => payment.state === "approved")
      .sort((left, right) => (right.approvedAt ?? "").localeCompare(left.approvedAt ?? ""))
      .map((payment) => ({
        id: payment.id,
        residentName: nameOf(payment.residentId),
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference || "—",
        approvedAt: payment.approvedAt ?? payment.paidAt,
        receiptNumber: payment.receiptNumber,
        claimState: claimFor(payment.id)?.state ?? null,
      })),
    claims: current.claims.map((claim) => {
      const payment = current.payments.find((entry) => entry.id === claim.paymentId);
      return {
        id: claim.id,
        paymentId: claim.paymentId,
        residentName: payment ? nameOf(payment.residentId) : "Resident",
        amount: payment?.amount ?? 0,
        reason: claim.reason,
        state: claim.state,
        raisedAt: claim.raisedAt,
        resolutionNote: claim.resolutionNote,
        correctionInvoiceNumber: claim.correctionInvoiceNumber,
      };
    }),
    totals: {
      invoiceCount: collectible.length,
      totalBilled: collectible.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
      totalCollected: collectible.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
      totalOutstanding: collectible.reduce((sum, invoice) => sum + invoice.totalAmount - invoice.paidAmount, 0),
      overdueCount: collectible.filter((invoice) => invoice.state === "overdue").length,
      readyToGenerateCount: ready.length,
      readyToGenerateTotal: ready.reduce((sum, row) => sum + row.rent, 0),
    },
  };
}

export function demoOperationsData(current: DemoState = state) {
  const residents = demoResidentsData(current);
  return {
    tickets: [...current.tickets].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    residents: residents.residents.map((resident) => ({
      id: resident.id,
      fullName: resident.fullName,
      roomNumber: `${resident.roomCode} · ${resident.bedLabel}`,
      securityDeposit: resident.depositPromised,
      monthlyRent: resident.monthlyRent,
    })),
    noticePeriodCount: residents.totals.noticeResidents,
  };
}

export function demoReportsData(current: DemoState = state): ReportsData {
  const collections = demoCollectionsData(current);
  const approved = current.payments.filter((payment) => payment.state === "approved");
  const occupied = current.beds.filter((bed) => bed.state === "occupied" || bed.state === "notice_period").length;
  const living = current.residents.filter((resident) => resident.state === "active" || resident.state === "notice");
  return {
    periodLabel: collections.periodLabel,
    collections: {
      invoiceCount: collections.totals.invoiceCount,
      totalBilled: collections.totals.totalBilled,
      totalCollected: collections.totals.totalCollected,
      totalOutstanding: collections.totals.totalOutstanding,
      overdueCount: collections.totals.overdueCount,
      collectedByUpi: approved.filter((payment) => payment.method === "upi").reduce((sum, payment) => sum + payment.amount, 0),
      collectedByCash: approved.filter((payment) => payment.method === "cash").reduce((sum, payment) => sum + payment.amount, 0),
    },
    occupancy: {
      totalBeds: current.beds.length,
      occupiedBeds: occupied,
      vacantBeds: current.beds.filter((bed) => bed.state === "vacant").length,
      maintenanceBeds: current.beds.filter((bed) => bed.state === "maintenance").length,
      occupancyRate: current.beds.length ? Math.round((occupied / current.beds.length) * 1000) / 10 : 0,
    },
    deposits: {
      heldTotal: living.reduce((sum, resident) => sum + resident.depositPromised, 0),
      residentCount: living.length,
    },
  };
}

export function demoOverviewData(current: DemoState = state) {
  const rooms = demoRoomsData(current);
  const residents = demoResidentsData(current);
  const collections = demoCollectionsData(current);
  return {
    rooms: rooms.totals,
    residents: {
      residentLimit: residents.residentLimit,
      activeResidents: residents.totals.activeResidents,
      noticeResidents: residents.totals.noticeResidents,
      availableBeds: residents.totals.availableBeds,
      totalOutstanding: residents.totals.totalOutstanding,
    },
    collections: {
      periodLabel: collections.periodLabel,
      upiConfigured: collections.upiConfigured,
      pendingPayments: collections.pendingPayments.length,
      invoiceCount: collections.totals.invoiceCount,
      totalBilled: collections.totals.totalBilled,
      totalCollected: collections.totals.totalCollected,
      totalOutstanding: collections.totals.totalOutstanding,
      overdueCount: collections.totals.overdueCount,
      readyToGenerateCount: collections.totals.readyToGenerateCount,
    },
  };
}

/** The resident's payment page for one demo invoice (or the first unpaid one). */
export function demoPaymentRequest(invoiceId: string, current: DemoState = state): LivePaymentRequest | null {
  const payable = (invoice: DemoInvoice) => !invoice.void && invoice.paidAmount < invoice.totalAmount;
  const invoice = current.invoices.find((entry) => entry.id === invoiceId && payable(entry)) ?? current.invoices.find(payable);
  const resident = invoice ? current.residents.find((entry) => entry.id === invoice.residentId) : undefined;
  if (!invoice || !resident) return null;
  const amount = invoice.totalAmount - invoice.paidAmount;
  const reference = `${current.settings.notePrefix}-${invoice.number}`.slice(0, 35);
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    pgName: DEMO_PG_NAME,
    residentName: resident.fullName,
    period: invoice.period,
    amount,
    upiId: current.settings.upiId,
    payeeName: current.settings.payeeName,
    reference,
    // Deliberately empty: the demo must never produce a payable UPI link.
    upiUri: "",
    uploadedQrUrl: null,
  };
}

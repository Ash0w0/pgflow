import type {
  ActivityItem,
  CollectionPoint,
  ComplaintSummary,
  Metric,
  PaymentReview,
  ProvisionedProperty,
  RoomSummary,
} from "./types";

export const demoBrand = {
  name: "PGFlow Sample",
  shortName: "PGFlow",
  platform: "PGFlow",
  initials: "ND",
  primary: "#123d32",
  accent: "#d7ff86",
  supportPhone: "+91 00000 00000",
  upiId: "sample.pgflow@upi",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  templateVersion: "1.0.0",
} as const;

export const overviewMetrics: Metric[] = [
  {
    label: "Collected this month",
    value: "₹3,86,400",
    detail: "of ₹4,72,800 billed",
    trend: "+8.4% vs last month",
    tone: "positive",
  },
  {
    label: "Outstanding",
    value: "₹86,400",
    detail: "across 11 residents",
    trend: "6 payments overdue",
    tone: "warning",
  },
  {
    label: "Occupancy",
    value: "48 / 60",
    detail: "80% of beds occupied",
    trend: "3 move-outs upcoming",
    tone: "accent",
  },
  {
    label: "Open operations",
    value: "09",
    detail: "6 complaints · 3 move-outs",
    trend: "2 need attention today",
    tone: "neutral",
  },
];

export const collectionSeries: CollectionPoint[] = [
  { month: "Feb", billed: 420, collected: 381 },
  { month: "Mar", billed: 432, collected: 397 },
  { month: "Apr", billed: 448, collected: 421 },
  { month: "May", billed: 452, collected: 408 },
  { month: "Jun", billed: 466, collected: 438 },
  { month: "Jul", billed: 473, collected: 386 },
];

export const paymentReviews: PaymentReview[] = [
  {
    id: "pay_demo_001",
    tenant: "Mira Kapoor",
    initials: "MK",
    room: "A-204 · Bed 2",
    amount: 8500,
    utr: "DEMO48291073",
    submittedAt: "12 min ago",
    invoice: "July 2026",
    method: "UPI",
    state: "pending_review",
  },
  {
    id: "pay_demo_002",
    tenant: "Kavya Mehta",
    initials: "KM",
    room: "B-105 · Bed 1",
    amount: 9200,
    utr: "DEMO77120644",
    submittedAt: "38 min ago",
    invoice: "July 2026",
    method: "UPI",
    warning: "Screenshot hash resembles an earlier submission",
    state: "pending_review",
  },
  {
    id: "pay_demo_003",
    tenant: "Sana Iyer",
    initials: "SI",
    room: "C-301 · Bed 1",
    amount: 4000,
    utr: "CASH-0717-08",
    submittedAt: "1 hr ago",
    invoice: "July 2026 · Partial",
    method: "Cash",
    state: "pending_review",
  },
];

export const roomSummaries: RoomSummary[] = [
  { id: "r1", floor: "Ground", room: "G-101", occupied: 3, total: 3, rent: 7500, state: "occupied" },
  { id: "r2", floor: "Ground", room: "G-102", occupied: 2, total: 3, rent: 7500, state: "vacant" },
  { id: "r3", floor: "First", room: "A-201", occupied: 3, total: 3, rent: 8200, state: "occupied" },
  { id: "r4", floor: "First", room: "A-204", occupied: 2, total: 2, rent: 8500, state: "notice_period" },
  { id: "r5", floor: "Second", room: "B-105", occupied: 1, total: 2, rent: 9200, state: "vacant" },
  { id: "r6", floor: "Second", room: "B-208", occupied: 0, total: 2, rent: 8800, state: "maintenance" },
];

export const complaints: ComplaintSummary[] = [
  { id: "CMP-1042", title: "Wi-Fi drops after 9 PM", category: "Internet", room: "A-204", priority: "High", state: "in_progress", updated: "18 min ago" },
  { id: "CMP-1041", title: "Tap leaking near wash basin", category: "Plumbing", room: "G-102", priority: "Medium", state: "assigned", updated: "1 hr ago" },
  { id: "CMP-1038", title: "Tube light replacement", category: "Electricity", room: "B-105", priority: "Low", state: "resolved", updated: "Yesterday" },
];

export const recentActivity: ActivityItem[] = [
  { id: "a1", title: "Payment proof submitted", description: "Mira Kapoor · ₹8,500 · July rent", time: "12 min", kind: "payment" },
  { id: "a2", title: "Complaint moved to in progress", description: "CMP-1042 · Assigned to Rohan", time: "18 min", kind: "complaint" },
  { id: "a3", title: "Move-out request received", description: "Ananya Rao · A-204 · 31 Jul", time: "46 min", kind: "moveout" },
  { id: "a4", title: "Water maintenance notice sent", description: "Delivered to 45 of 48 residents", time: "2 hr", kind: "notice" },
];

export const provisionedProperties: ProvisionedProperty[] = [
  {
    id: "org_sample_pgflow",
    name: "PGFlow Sample",
    slug: "pgflow-sample",
    beds: 60,
    occupied: 48,
    templateVersion: "1.0.0",
    state: "demo",
    brand: "#123d32",
    domain: "demo.pgflow.app",
    whatsapp: "simulated",
  },
  {
    id: "org_synth_20",
    name: "Iris Women’s Residence",
    slug: "iris-residence",
    beds: 20,
    occupied: 17,
    templateVersion: "1.0.0",
    state: "core_ready",
    brand: "#6d4aff",
    domain: "iris.pgflow.app",
    whatsapp: "pending",
  },
  {
    id: "org_synth_80",
    name: "The Courtyard PG",
    slug: "courtyard",
    beds: 80,
    occupied: 71,
    templateVersion: "1.0.0",
    state: "integrations_pending",
    brand: "#f26b3a",
    domain: "stay.thecourtyard.example",
    whatsapp: "pending",
  },
  {
    id: "org_synth_200",
    name: "MetroNest Living",
    slug: "metronest",
    beds: 200,
    occupied: 186,
    templateVersion: "1.0.0",
    state: "live",
    brand: "#1976d2",
    domain: "app.metronest.example",
    whatsapp: "connected",
  },
];

export const hindi = {
  greeting: "नमस्ते, आरव",
  overview: "आज का सारांश",
  collected: "इस महीने प्राप्त",
  outstanding: "बाकी राशि",
  occupancy: "ऑक्यूपेंसी",
  operations: "लंबित कार्य",
  payNow: "UPI से भुगतान करें",
  currentDue: "वर्तमान बकाया",
  complaints: "शिकायतें",
  receipts: "रसीदें",
} as const;

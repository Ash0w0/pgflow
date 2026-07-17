export type Role = "owner" | "manager" | "accountant" | "tenant" | "platform_operator";

export type PaymentState =
  | "pending_review"
  | "approved"
  | "rejected"
  | "reversed"
  | "refunded";

export type BedState =
  | "vacant"
  | "reserved"
  | "occupied"
  | "notice_period"
  | "maintenance"
  | "inactive";

export type ComplaintState =
  | "open"
  | "assigned"
  | "in_progress"
  | "waiting_for_tenant"
  | "resolved"
  | "closed"
  | "cancelled";

export interface Metric {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: "positive" | "warning" | "neutral" | "accent";
}

export interface CollectionPoint {
  month: string;
  billed: number;
  collected: number;
}

export interface PaymentReview {
  id: string;
  tenant: string;
  initials: string;
  room: string;
  amount: number;
  utr: string;
  submittedAt: string;
  invoice: string;
  method: "UPI" | "Cash";
  warning?: string;
  state: PaymentState;
}

export interface RoomSummary {
  id: string;
  floor: string;
  room: string;
  occupied: number;
  total: number;
  rent: number;
  state: BedState;
}

export interface ComplaintSummary {
  id: string;
  title: string;
  category: string;
  room: string;
  priority: "Low" | "Medium" | "High";
  state: ComplaintState;
  updated: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  time: string;
  kind: "payment" | "complaint" | "moveout" | "notice";
}

export interface ProvisionedProperty {
  id: string;
  name: string;
  slug: string;
  beds: number;
  occupied: number;
  templateVersion: string;
  state: "demo" | "core_ready" | "integrations_pending" | "live" | "draft";
  brand: string;
  domain: string;
  whatsapp: "simulated" | "pending" | "connected";
}

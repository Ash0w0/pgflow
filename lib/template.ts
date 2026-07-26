export const BLANK_TEMPLATE = Object.freeze({
  id: "pgflow-blank",
  version: "1.0.0",
  businessData: false,
  roles: ["platform_operator", "owner", "manager", "accountant", "tenant"],
  languages: ["en-IN", "hi-IN"],
  paymentMethods: ["upi", "cash"],
  invoiceStates: ["draft", "issued", "partially_paid", "paid", "overdue", "void"],
  paymentStates: ["pending_review", "approved", "rejected", "reversed", "refunded"],
  brandingSlots: ["name", "short_name", "logo", "primary", "accent", "app_icon", "receipt_identity"],
  defaultQuietHours: { start: "20:00", end: "09:00", timezone: "Asia/Kolkata" },
  demoRecords: 0,
} as const);

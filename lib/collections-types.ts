export type BillingPreviewRow = {
  tenantId: string;
  residentName: string;
  roomLabel: string;
  rent: number;
  alreadyIssued: boolean;
};

export type CollectionInvoiceRow = {
  id: string;
  residentName: string;
  residentPhone: string;
  roomLabel: string;
  period: string;
  number: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  state: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
};

export type ApprovedPaymentRow = {
  id: string;
  residentName: string;
  method: "upi" | "cash";
  amount: number;
  reference: string;
  approvedAt: string;
  receiptNumber: string | null;
  claimState: "open" | "upheld" | "dismissed" | null;
};

export type PaymentClaimRow = {
  id: string;
  paymentId: string;
  residentName: string;
  amount: number;
  reason: string;
  state: "open" | "upheld" | "dismissed";
  raisedAt: string;
  resolutionNote: string | null;
  correctionInvoiceNumber: string | null;
};

export type CollectionsData = {
  period: string;
  periodLabel: string;
  dueDay: number;
  preview: BillingPreviewRow[];
  invoices: CollectionInvoiceRow[];
  upiConfigured: boolean;
  pendingPayments: Array<{ id: string; invoiceId: string; residentName: string; method: "upi" | "cash"; amount: number; reference: string; paidAt: string }>;
  approvedPayments: ApprovedPaymentRow[];
  claims: PaymentClaimRow[];
  totals: {
    invoiceCount: number;
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    overdueCount: number;
    readyToGenerateCount: number;
    readyToGenerateTotal: number;
  };
};

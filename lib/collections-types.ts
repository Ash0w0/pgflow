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
  roomLabel: string;
  period: string;
  number: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  state: "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
};

export type CollectionsData = {
  period: string;
  periodLabel: string;
  dueDay: number;
  preview: BillingPreviewRow[];
  invoices: CollectionInvoiceRow[];
  upiConfigured: boolean;
  pendingPayments: Array<{ id: string; invoiceId: string; residentName: string; method: "upi" | "cash"; amount: number; reference: string; paidAt: string }>;
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

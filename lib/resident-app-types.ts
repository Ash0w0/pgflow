export type ResidentBillStatus = "due" | "overdue" | "in_review" | "paid";

export type ResidentBill = {
  id: string;
  number: string;
  period: string;
  periodLabel: string;
  dueDate: string;
  total: number;
  paid: number;
  balance: number;
  status: ResidentBillStatus;
};

export type ResidentPayment = {
  id: string;
  billId: string;
  periodLabel: string;
  method: "upi" | "cash";
  amount: number;
  reference: string;
  paidAt: string;
  state: "pending_review" | "approved" | "rejected";
  receiptNumber: string | null;
};

export type ResidentTicketCategory = "wifi" | "plumbing" | "electrical" | "cleaning" | "food" | "other";

export type ResidentTicket = {
  id: string;
  category: ResidentTicketCategory;
  title: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
};

export type ResidentAppData = {
  demo: boolean;
  /** Today and the current hour in India, so greetings and due dates match the PG. */
  today: string;
  hour: number;
  resident: {
    firstName: string;
    fullName: string;
    phoneMasked: string;
    roomLabel: string;
    floorName: string;
    moveInDate: string;
    monthlyRent: number;
    deposit: number;
    onNotice: boolean;
  };
  pg: { name: string; supportPhone: string | null; upiReady: boolean; dueDay: number };
  bills: ResidentBill[];
  payments: ResidentPayment[];
  tickets: ResidentTicket[];
};

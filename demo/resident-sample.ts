import type { ResidentAppData } from "@/lib/resident-app-types";

/** Fictional resident used only by the demo runtime. */
export function sampleResidentAppData(): ResidentAppData {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
  const [year, month] = today.split("-").map(Number);
  const period = (offset: number) => {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = (value: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T00:00:00Z`));
  const due = new Date(Date.UTC(year, month - 1, Number(today.slice(8)) + 3)).toISOString().slice(0, 10);

  return {
    demo: true,
    today,
    hour: Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(now)) % 24,
    resident: { firstName: "Mira", fullName: "Mira Kapoor", phoneMasked: "+91 ••••• ••210", roomLabel: "A-204 · Bed 2", floorName: "Second floor", moveInDate: `${year - 1}-08-01`, monthlyRent: 8500, deposit: 17000, onNotice: false },
    pg: { name: "Sample PG", supportPhone: null, upiReady: true, dueDay: 5 },
    bills: [
      { id: "demo-0", number: "INV-DEMO-0726", period: period(0), periodLabel: label(period(0)), dueDate: due, total: 8500, paid: 0, balance: 8500, status: "due" },
      ...[1, 2, 3, 4].map((offset) => ({ id: `demo-${offset}`, number: `INV-DEMO-${offset}`, period: period(offset), periodLabel: label(period(offset)), dueDate: `${period(offset)}-05`, total: 8500, paid: 8500, balance: 0, status: "paid" as const })),
    ],
    payments: [1, 2, 3, 4].map((offset) => ({ id: `demo-pay-${offset}`, billId: `demo-${offset}`, periodLabel: label(period(offset)), method: offset === 3 ? "cash" as const : "upi" as const, amount: 8500, reference: offset === 3 ? "" : `DEMO11829${offset}`, paidAt: `${period(offset)}-04T10:00:00+05:30`, state: "approved" as const, receiptNumber: `RCPT-0064${offset}` })),
    tickets: [{ id: "demo-ticket", category: "wifi", title: "Wi-Fi drops after 9 PM", status: "in_progress", createdAt: now.toISOString() }],
  };
}

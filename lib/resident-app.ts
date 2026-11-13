import "server-only";

import { maskIndianPhone } from "./owner-invitations";
import { billingPeriodLabel } from "./receipt-data";
import type { ResidentAppData, ResidentBill, ResidentPayment, ResidentTicket } from "./resident-app-types";
import { getSupabaseAdmin } from "./supabase/admin";
import { selectAll } from "./supabase/select-all";

/**
 * Everything one signed-in resident may see. Every query is scoped to the
 * organization, the property, and this resident's own record.
 */
export async function getResidentAppData(organizationId: string, propertyId: string, residentId: string): Promise<ResidentAppData> {
  const admin = getSupabaseAdmin();
  const [profile, property, brand, occupancy, invoices, payments, receipts, tickets] = await Promise.all([
    admin.from("tenant_profiles").select("full_name,phone,state").eq("organization_id", organizationId).eq("property_id", propertyId).eq("id", residentId).single(),
    admin.from("properties").select("name,support_phone,rent_due_day,upi_id,upi_payee_name").eq("organization_id", organizationId).eq("id", propertyId).single(),
    admin.from("brand_themes").select("app_name").eq("organization_id", organizationId).maybeSingle(),
    admin.from("occupancies").select("bed_id,move_in_date,monthly_rent,deposit_promised").eq("organization_id", organizationId).eq("property_id", propertyId).eq("tenant_id", residentId).in("state", ["active", "notice"]).order("move_in_date", { ascending: false }).limit(1).maybeSingle(),
    selectAll((from, to) => admin.from("invoices").select("id,number,period,due_date,total_amount,paid_amount,state").eq("organization_id", organizationId).eq("property_id", propertyId).eq("tenant_id", residentId).order("due_date", { ascending: false }).order("id").range(from, to)),
    selectAll((from, to) => admin.from("payments").select("id,invoice_id,method,amount,reference,paid_at,state").eq("organization_id", organizationId).eq("property_id", propertyId).eq("tenant_id", residentId).order("paid_at", { ascending: false }).order("id").range(from, to)),
    selectAll((from, to) => admin.from("receipts").select("payment_id,number").eq("organization_id", organizationId).eq("property_id", propertyId).eq("tenant_id", residentId).order("payment_id").range(from, to)),
    admin.from("maintenance_tickets").select("id,category,title,status,created_at").eq("organization_id", organizationId).eq("resident_id", residentId).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const result of [profile, property, brand, occupancy, invoices, payments, receipts, tickets]) {
    if (result.error) throw new Error("The resident home could not be loaded.");
  }
  if (!profile.data || !property.data) throw new Error("The resident home could not be loaded.");

  let roomLabel = "";
  let floorName = "";
  if (occupancy.data?.bed_id) {
    const { data: bed } = await admin.from("beds").select("label,room_id").eq("organization_id", organizationId).eq("id", occupancy.data.bed_id).maybeSingle();
    const { data: room } = bed
      ? await admin.from("rooms").select("code,floor_id").eq("organization_id", organizationId).eq("id", bed.room_id).maybeSingle()
      : { data: null };
    const { data: floor } = room?.floor_id
      ? await admin.from("floors").select("name").eq("organization_id", organizationId).eq("id", room.floor_id).maybeSingle()
      : { data: null };
    if (bed && room) roomLabel = `${room.code} · ${bed.label}`;
    floorName = floor?.name ?? "";
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const inReview = new Set((payments.data ?? []).filter((payment) => payment.state === "pending_review").map((payment) => payment.invoice_id));
  const periodByInvoice = new Map((invoices.data ?? []).map((invoice) => [invoice.id, billingPeriodLabel(invoice.period)]));
  const receiptByPayment = new Map((receipts.data ?? []).map((receipt) => [receipt.payment_id, receipt.number]));

  const bills: ResidentBill[] = (invoices.data ?? [])
    .filter((invoice) => ["issued", "partially_paid", "overdue", "paid"].includes(invoice.state))
    .map((invoice) => {
      const total = Number(invoice.total_amount);
      const paid = Number(invoice.paid_amount);
      const balance = Math.max(total - paid, 0);
      const status = balance <= 0 ? "paid" : inReview.has(invoice.id) ? "in_review" : invoice.due_date < today ? "overdue" : "due";
      return { id: invoice.id, number: invoice.number, period: invoice.period, periodLabel: billingPeriodLabel(invoice.period), dueDate: invoice.due_date, total, paid, balance, status };
    });

  const residentPayments: ResidentPayment[] = (payments.data ?? [])
    .filter((payment) => ["pending_review", "approved", "rejected"].includes(payment.state))
    .map((payment) => ({
      id: payment.id,
      billId: payment.invoice_id,
      periodLabel: periodByInvoice.get(payment.invoice_id) ?? "Payment",
      method: payment.method === "cash" ? "cash" : "upi",
      amount: Number(payment.amount),
      reference: payment.reference ?? "",
      paidAt: payment.paid_at,
      state: payment.state as ResidentPayment["state"],
      receiptNumber: payment.state === "approved" ? receiptByPayment.get(payment.id) ?? null : null,
    }));

  const fullName = profile.data.full_name as string;
  const supportDigits = String(property.data.support_phone ?? "").replace(/\D/g, "");
  return {
    demo: false,
    today,
    hour: Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) % 24,
    resident: {
      firstName: fullName.trim().split(/\s+/)[0] ?? fullName,
      fullName,
      phoneMasked: maskIndianPhone(profile.data.phone),
      roomLabel,
      floorName,
      moveInDate: occupancy.data?.move_in_date ?? "",
      monthlyRent: Number(occupancy.data?.monthly_rent ?? 0),
      deposit: Number(occupancy.data?.deposit_promised ?? 0),
      onNotice: profile.data.state === "notice",
    },
    pg: {
      name: brand.data?.app_name || property.data.name,
      supportPhone: supportDigits.length === 10 ? `91${supportDigits}` : supportDigits.length === 12 ? supportDigits : null,
      upiReady: Boolean(property.data.upi_id && property.data.upi_payee_name),
      dueDay: Number(property.data.rent_due_day),
    },
    bills,
    payments: residentPayments,
    tickets: (tickets.data ?? []).map((ticket) => ({
      id: ticket.id,
      category: ticket.category,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.created_at,
    })) as ResidentTicket[],
  };
}

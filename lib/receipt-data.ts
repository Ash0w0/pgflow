import "server-only";

import type { ReceiptData } from "./receipt-generator";
import { getSupabaseAdmin } from "./supabase/admin";

export function indiaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value));
}

export function billingPeriodLabel(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (match) {
    return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
  }
  if (period === "opening") return "Opening balance";
  if (period.startsWith("correction-")) return "Correction";
  return period;
}

export type LoadedReceipt = {
  data: ReceiptData;
  residentName: string;
  residentPhone: string;
  tenantId: string;
  propertyId: string;
  periodLabel: string;
};

/**
 * Loads an issued receipt for one payment in one organization.
 * Returns null when no receipt exists or the payment is no longer approved.
 */
export async function loadReceipt(
  organizationId: string,
  paymentId: string,
  propertyId?: string,
): Promise<LoadedReceipt | null> {
  const admin = getSupabaseAdmin();
  let receiptQuery = admin
    .from("receipts")
    .select("number,amount,issued_at,issued_by,invoice_id,tenant_id,property_id")
    .eq("organization_id", organizationId)
    .eq("payment_id", paymentId);
  if (propertyId) receiptQuery = receiptQuery.eq("property_id", propertyId);
  const { data: receipt, error: receiptError } = await receiptQuery.maybeSingle();
  if (receiptError) throw new Error("The receipt could not be loaded.");
  if (!receipt) return null;

  const [payment, invoice, resident, property, brand, issuer, occupancy] = await Promise.all([
    admin.from("payments").select("method,reference,paid_at,state")
      .eq("organization_id", organizationId).eq("id", paymentId).maybeSingle(),
    admin.from("invoices").select("period,number")
      .eq("organization_id", organizationId).eq("id", receipt.invoice_id).maybeSingle(),
    admin.from("tenant_profiles").select("full_name,phone")
      .eq("organization_id", organizationId).eq("id", receipt.tenant_id).maybeSingle(),
    admin.from("properties").select("name,address,support_phone")
      .eq("organization_id", organizationId).eq("id", receipt.property_id).maybeSingle(),
    admin.from("brand_themes").select("app_name")
      .eq("organization_id", organizationId).maybeSingle(),
    admin.from("memberships").select("display_name")
      .eq("organization_id", organizationId).eq("auth_user_id", receipt.issued_by).maybeSingle(),
    admin.from("occupancies").select("bed_id,move_in_date")
      .eq("organization_id", organizationId).eq("tenant_id", receipt.tenant_id)
      .order("move_in_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if ([payment, invoice, resident, property, brand, issuer, occupancy].some((result) => result.error)
    || !payment.data || !invoice.data || !resident.data || !property.data) {
    throw new Error("The receipt could not be loaded.");
  }
  if (payment.data.state !== "approved") return null;

  let bedLabel = "";
  let roomCode = "";
  if (occupancy.data?.bed_id) {
    const { data: bed } = await admin.from("beds").select("label,room_id")
      .eq("organization_id", organizationId).eq("id", occupancy.data.bed_id).maybeSingle();
    bedLabel = bed?.label ?? "";
    if (bed?.room_id) {
      const { data: room } = await admin.from("rooms").select("code")
        .eq("organization_id", organizationId).eq("id", bed.room_id).maybeSingle();
      roomCode = room?.code ?? "";
    }
  }

  const periodLabel = billingPeriodLabel(invoice.data.period);
  return {
    residentName: resident.data.full_name,
    residentPhone: resident.data.phone,
    tenantId: receipt.tenant_id,
    propertyId: receipt.property_id,
    periodLabel,
    data: {
      receiptNumber: receipt.number,
      pgName: brand.data?.app_name || property.data.name,
      pgAddress: property.data.address || undefined,
      pgContact: property.data.support_phone || undefined,
      residentName: resident.data.full_name,
      roomNumber: roomCode || "Not assigned",
      bedNumber: bedLabel.replace(/^Bed\s+/i, "") || undefined,
      paymentDate: indiaDate(payment.data.paid_at ?? receipt.issued_at),
      billingPeriod: `${periodLabel} (${invoice.data.number})`,
      paymentMethod: payment.data.method === "cash" ? "Cash" : "UPI",
      referenceNumber: payment.data.reference || (payment.data.method === "cash" ? "Cash collected" : "Not provided"),
      amountPaid: Number(receipt.amount),
      issuedBy: issuer.data?.display_name || "Authorized staff",
    },
  };
}

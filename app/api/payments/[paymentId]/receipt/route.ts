import { jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { formatReceiptNumber, generateReceiptHtml } from "@/lib/receipt-generator";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

// Security headers (CSP, nosniff, referrer policy) come from next.config.ts.
// All receipt fields are HTML-escaped by generateReceiptHtml.
const RECEIPT_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
};

function indiaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(value));
}

function billingPeriodLabel(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor) return jsonError("Staff access is required.", 401);
  const { paymentId } = await params;

  if (isDemoRuntime()) {
    const today = new Date().toISOString().split("T")[0];
    return new Response(generateReceiptHtml({
      receiptNumber: formatReceiptNumber(paymentId, today),
      pgName: "PGFlow Sample",
      pgAddress: "14/2 Indiranagar, 10th Main, Bengaluru 560038",
      pgContact: "+91 98765 43210",
      residentName: "Mira Kapoor",
      roomNumber: "A-204",
      bedNumber: "2",
      paymentDate: today,
      billingPeriod: "July 2026",
      paymentMethod: "UPI",
      referenceNumber: "DEMO48291073",
      amountPaid: 8500,
      issuedBy: "Front Desk Manager",
    }), { headers: RECEIPT_HEADERS });
  }

  if (!isUuid(paymentId)) return jsonError("Receipt not found.", 404);

  const admin = getSupabaseAdmin();
  let receiptQuery = admin
    .from("receipts")
    .select("number,amount,issued_at,issued_by,invoice_id,tenant_id,property_id")
    .eq("organization_id", actor.organizationId)
    .eq("payment_id", paymentId);
  if (actor.propertyId) receiptQuery = receiptQuery.eq("property_id", actor.propertyId);
  const { data: receipt, error: receiptError } = await receiptQuery.maybeSingle();
  if (receiptError) return jsonError("The receipt could not be loaded.", 503);
  if (!receipt) return jsonError("No receipt has been issued for this payment.", 404);

  const [payment, invoice, resident, property, brand, issuer, occupancy] = await Promise.all([
    admin.from("payments").select("method,reference,paid_at,state")
      .eq("organization_id", actor.organizationId).eq("id", paymentId).maybeSingle(),
    admin.from("invoices").select("period,number")
      .eq("organization_id", actor.organizationId).eq("id", receipt.invoice_id).maybeSingle(),
    admin.from("tenant_profiles").select("full_name")
      .eq("organization_id", actor.organizationId).eq("id", receipt.tenant_id).maybeSingle(),
    admin.from("properties").select("name,address,support_phone")
      .eq("organization_id", actor.organizationId).eq("id", receipt.property_id).maybeSingle(),
    admin.from("brand_themes").select("app_name")
      .eq("organization_id", actor.organizationId).maybeSingle(),
    admin.from("memberships").select("display_name")
      .eq("organization_id", actor.organizationId).eq("auth_user_id", receipt.issued_by).maybeSingle(),
    admin.from("occupancies").select("bed_id,move_in_date")
      .eq("organization_id", actor.organizationId).eq("tenant_id", receipt.tenant_id)
      .order("move_in_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const failed = [payment, invoice, resident, property, brand, issuer, occupancy].find((result) => result.error);
  if (failed || !payment.data || !invoice.data || !resident.data || !property.data) {
    return jsonError("The receipt could not be loaded.", 503);
  }
  if (payment.data.state !== "approved") return jsonError("This payment is no longer approved.", 409);

  let bedLabel = "";
  let roomCode = "";
  if (occupancy.data?.bed_id) {
    const { data: bed } = await admin.from("beds").select("label,room_id")
      .eq("organization_id", actor.organizationId).eq("id", occupancy.data.bed_id).maybeSingle();
    bedLabel = bed?.label ?? "";
    if (bed?.room_id) {
      const { data: room } = await admin.from("rooms").select("code")
        .eq("organization_id", actor.organizationId).eq("id", bed.room_id).maybeSingle();
      roomCode = room?.code ?? "";
    }
  }

  return new Response(generateReceiptHtml({
    receiptNumber: receipt.number,
    pgName: brand.data?.app_name || property.data.name,
    pgAddress: property.data.address || undefined,
    pgContact: property.data.support_phone || undefined,
    residentName: resident.data.full_name,
    roomNumber: roomCode || "Not assigned",
    bedNumber: bedLabel.replace(/^Bed\s+/i, "") || undefined,
    paymentDate: indiaDate(payment.data.paid_at ?? receipt.issued_at),
    billingPeriod: `${billingPeriodLabel(invoice.data.period)} (${invoice.data.number})`,
    paymentMethod: payment.data.method === "cash" ? "Cash" : "UPI",
    referenceNumber: payment.data.reference || (payment.data.method === "cash" ? "Cash collected" : "Not provided"),
    amountPaid: Number(receipt.amount),
    issuedBy: issuer.data?.display_name || "Authorized staff",
  }), { headers: RECEIPT_HEADERS });
}

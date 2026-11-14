import { jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { formatReceiptNumber, generateReceiptHtml } from "@/lib/receipt-generator";
import { isDemoRuntime } from "@/lib/runtime";
import { loadReceipt } from "@/lib/receipt-data";

// Security headers (CSP, nosniff, referrer policy) come from next.config.ts.
// All receipt fields are HTML-escaped by generateReceiptHtml.
const RECEIPT_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params;

  // The public demo has no accounts: it always shows the same sample receipt.
  if (isDemoRuntime()) {
    const now = new Date();
    const india = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).format(now);
    return new Response(generateReceiptHtml({
      receiptNumber: formatReceiptNumber(paymentId, now.toISOString().split("T")[0]),
      pgName: "PGFlow Sample",
      pgAddress: "Sample receipt from the PGFlow demo",
      pgContact: "",
      residentName: "Sample Resident",
      roomNumber: "G-101",
      bedNumber: "1",
      paymentDate: india({ day: "2-digit", month: "short", year: "numeric" }),
      billingPeriod: india({ month: "long", year: "numeric" }),
      paymentMethod: "UPI",
      referenceNumber: "DEMO48291073",
      amountPaid: 7500,
      issuedBy: "Demo owner",
    }), { headers: RECEIPT_HEADERS });
  }

  const actor = await requireActor(request, ["owner", "manager", "accountant", "tenant"]);
  if (!actor) return jsonError("Sign in to view this receipt.", 401);

  if (!isUuid(paymentId)) return jsonError("Receipt not found.", 404);

  let receipt;
  try {
    receipt = await loadReceipt(actor.organizationId, paymentId, actor.propertyId);
  } catch {
    return jsonError("The receipt could not be loaded.", 503);
  }
  // A resident may only open receipts issued to them.
  if (receipt && actor.role === "tenant" && receipt.tenantId !== actor.tenantId) receipt = null;
  if (!receipt) return jsonError("No receipt has been issued for this payment, or it is no longer approved.", 404);

  return new Response(generateReceiptHtml(receipt.data), { headers: RECEIPT_HEADERS });
}

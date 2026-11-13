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
  const actor = await requireActor(request, ["owner", "manager", "accountant", "tenant"]);
  if (!actor) return jsonError("Sign in to view this receipt.", 401);
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

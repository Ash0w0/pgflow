import { hashPaymentLinkToken, isPaymentLinkToken } from "@/lib/payment-links";
import { loadReceipt } from "@/lib/receipt-data";
import { generateReceiptHtml } from "@/lib/receipt-generator";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolvePublicBrandContext } from "@/lib/tenancy";

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "x-robots-tag": "noindex, nofollow",
};

function notFound() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Receipt unavailable</title><body style=\"font-family:system-ui;padding:2rem\"><h1>This receipt link is invalid or has expired.</h1><p>Ask your PG for a new copy of the receipt.</p></body>",
    { status: 404, headers: HTML_HEADERS },
  );
}

/** Public, token-scoped receipt for residents who received it on WhatsApp. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (isDemoRuntime()) return notFound();
  const { token } = await params;
  if (!isPaymentLinkToken(token)) return notFound();

  // The link only works on the PG's own web address.
  const tenant = await resolvePublicBrandContext(request).catch(() => null);
  if (!tenant) return notFound();

  const { data: link, error } = await getSupabaseAdmin()
    .from("receipt_links")
    .select("organization_id,payment_id,expires_at")
    .eq("token_hash", hashPaymentLinkToken(token))
    .maybeSingle();
  if (error || !link || link.organization_id !== tenant.organizationId || Date.parse(link.expires_at) <= Date.now()) {
    return notFound();
  }

  try {
    const receipt = await loadReceipt(link.organization_id, link.payment_id);
    if (!receipt) return notFound();
    return new Response(generateReceiptHtml(receipt.data), { headers: HTML_HEADERS });
  } catch {
    return new Response("The receipt is temporarily unavailable. Please try again shortly.", { status: 503, headers: { "cache-control": "no-store" } });
  }
}

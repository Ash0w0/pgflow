import { createPaymentLinkSecret } from "@/lib/payment-links";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requestHostname } from "@/lib/tenancy";

function verifiedPaymentOrigin(request: Request) {
  const hostname = requestHostname(request);
  if (!hostname) throw new Error("A verified PG hostname is required.");

  const suppliedOrigin = request.headers.get("origin");
  if (suppliedOrigin) return new URL(suppliedOrigin).origin;

  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.trim().toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? `${forwardedProtocol}:`
    : requestUrl.protocol;
  const authority = request.headers.get("host") ?? request.headers.get("x-forwarded-host") ?? "";
  const portMatch = authority.match(/:(\d{1,5})$/);
  const portNumber = portMatch ? Number(portMatch[1]) : 0;
  const port = portNumber > 0 && portNumber <= 65_535 ? `:${portNumber}` : "";
  return `${protocol}//${hostname}${port}`;
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin payment-link changes are not allowed.", 403);
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor?.propertyId) return jsonError("Active staff access is required.", 401);

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Object.keys(body).length !== 1 || typeof body.invoiceId !== "string" || !isUuid(body.invoiceId)) {
    return jsonError("A valid invoice is required.");
  }

  const { token, tokenHash } = createPaymentLinkSecret();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc("create_invoice_payment_request", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_invoice_id: body.invoiceId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) {
    return jsonError(
      error.message ?? "The payment link could not be created.",
      error.code === "42501" ? 403 : error.code === "P0001" ? 409 : 400,
    );
  }

  const paymentUrl = new URL(`/pay/${body.invoiceId}`, verifiedPaymentOrigin(request));
  paymentUrl.searchParams.set("token", token);
  return Response.json({ created: true, paymentRequest: data, url: paymentUrl.toString(), expiresAt }, {
    status: 201,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

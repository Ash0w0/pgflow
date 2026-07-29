import { isValidUtr, normalizeUtr } from "@/lib/domain";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { hashPaymentLinkToken, isPaymentLinkToken } from "@/lib/payment-links";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin payment submissions are not allowed.", 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token : null;
  const expectedKeys = token ? 9 : 8;
  if (
    !body
    || Object.keys(body).length !== expectedKeys
    || typeof body.invoiceId !== "string"
    || !isUuid(body.invoiceId)
    || !Number.isInteger(body.amount)
    || typeof body.utr !== "string"
    || typeof body.paidAt !== "string"
    || typeof body.objectKey !== "string"
    || typeof body.contentType !== "string"
    || typeof body.fileHash !== "string"
    || typeof body.note !== "string"
  ) return jsonError("Complete the payment evidence details.");
  if (
    Number(body.amount) <= 0
    || !isValidUtr(body.utr)
    || Number.isNaN(Date.parse(body.paidAt))
    || !/^[a-f0-9]{64}$/.test(body.fileHash)
  ) return jsonError("Payment evidence is invalid.");

  const admin = getSupabaseAdmin();
  let data: unknown;
  let error: { code?: string; message?: string } | null;

  if (token) {
    if (!isPaymentLinkToken(token)) return jsonError("This payment link is invalid or expired.", 403);
    const result = await admin.rpc("submit_public_upi_payment_evidence", {
      p_token_hash: hashPaymentLinkToken(token),
      p_invoice_id: body.invoiceId,
      p_amount: body.amount,
      p_reference: normalizeUtr(body.utr),
      p_paid_at: body.paidAt,
      p_object_key: body.objectKey,
      p_content_type: body.contentType,
      p_file_hash: body.fileHash,
      p_note: body.note.slice(0, 500),
    });
    data = result.data;
    error = result.error;
  } else {
    const actor = await requireActor(request, ["tenant", "owner", "manager", "accountant"]);
    if (!actor?.propertyId) return jsonError("An authenticated PG session is required.", 401);
    const result = await admin.rpc("submit_upi_payment_evidence", {
      p_actor_user_id: actor.id,
      p_organization_id: actor.organizationId,
      p_property_id: actor.propertyId,
      p_invoice_id: body.invoiceId,
      p_amount: body.amount,
      p_reference: normalizeUtr(body.utr),
      p_paid_at: body.paidAt,
      p_object_key: body.objectKey,
      p_content_type: body.contentType,
      p_file_hash: body.fileHash,
      p_note: body.note.slice(0, 500),
    });
    data = result.data;
    error = result.error;
  }

  if (error) {
    await admin.storage.from("payment-evidence").remove([body.objectKey]).catch(() => undefined);
    return jsonError(
      error.code === "23505"
        ? "That UTR or screenshot was already submitted."
        : error.message ?? "Evidence could not be submitted.",
      error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400,
    );
  }
  return Response.json({
    submitted: true,
    payment: data,
    ownerNotification: { handledBy: "database_trigger" },
  }, {
    status: 201,
    headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

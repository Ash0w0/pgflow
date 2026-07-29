import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const rejectionReasons = new Set(["amount_not_received", "incorrect_amount", "duplicate_utr", "invalid_screenshot", "wrong_account", "more_information_needed"]);

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin payment reviews are not allowed.", 403);
  const actor = await requireActor(request, ["owner", "accountant"]);
  if (!actor?.propertyId) return jsonError("Owner or accountant approval is required.", 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Object.keys(body).length !== 3 || typeof body.paymentId !== "string" || !isUuid(body.paymentId) || !["approve", "reject"].includes(String(body.decision)) || typeof body.reason !== "string") return jsonError("Payment, decision and reason are required.");
  if (body.decision === "reject" && !rejectionReasons.has(body.reason)) return jsonError("Choose a supported rejection reason.");
  const { data, error } = await getSupabaseAdmin().rpc("review_payment", { p_actor_user_id: actor.id, p_organization_id: actor.organizationId, p_property_id: actor.propertyId, p_payment_id: body.paymentId, p_decision: body.decision, p_reason: body.reason || null });
  if (error) return jsonError(error.message ?? "Payment review did not complete.", error.code === "42501" ? 403 : 400);
  return Response.json({
    reviewed: true,
    review: data,
    residentNotification: { handledBy: "database_trigger" },
  }, { headers: { "cache-control": "no-store" } });
}

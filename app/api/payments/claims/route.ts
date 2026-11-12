import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const NO_STORE = { "cache-control": "no-store" };

async function readJson(request: Request) {
  const text = await request.text().catch(() => "");
  if (text.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return jsonError(error.message ?? "You can't do this for this PG.", 403);
  if (error.code === "P0002") return jsonError(error.message ?? "Not found.", 404);
  if (error.code === "23505") return jsonError("This payment already has an open or upheld claim.", 409);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The claim is not allowed.", 409);
  return jsonError("The claim could not be saved. Try again.", 503);
}

/** Raise a claim that an approved payment was approved by mistake. Approved records are never reversed. */
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin claims are not allowed.", 403);
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor?.propertyId) return jsonError("Active PG staff access is required.", 401);

  const body = await readJson(request);
  if (!body || Object.keys(body).length !== 2 || typeof body.paymentId !== "string" || !isUuid(body.paymentId) || typeof body.reason !== "string") {
    return jsonError("Choose the payment and describe what went wrong.");
  }

  const { data, error } = await getSupabaseAdmin().rpc("raise_payment_claim", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_payment_id: body.paymentId,
    p_reason: body.reason.trim(),
  });
  if (error) return rpcError(error);
  return Response.json({ raised: true, claim: data }, { status: 201, headers: NO_STORE });
}

/** The owner upholds (adds a correction due) or dismisses a claim. */
export async function PATCH(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin claim decisions are not allowed.", 403);
  const actor = await requireActor(request, ["owner"]);
  if (!actor) return jsonError("Only the PG owner can resolve claims.", 401);

  const body = await readJson(request);
  if (
    !body
    || typeof body.claimId !== "string" || !isUuid(body.claimId)
    || !["uphold", "dismiss"].includes(String(body.decision))
    || (body.note !== undefined && typeof body.note !== "string")
  ) {
    return jsonError("Choose the claim and a decision.");
  }

  const { data, error } = await getSupabaseAdmin().rpc("resolve_payment_claim", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_claim_id: body.claimId,
    p_decision: body.decision,
    p_note: typeof body.note === "string" ? body.note : "",
  });
  if (error) return rpcError(error);
  return Response.json({ resolved: true, claim: data }, { headers: NO_STORE });
}

import { currentIndiaBillingPeriod } from "@/lib/billing-period";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 256;

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return jsonError("Only the active property owner can generate rent invoices.", 403);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The billing period is invalid.");
  if (error.code === "23505") return jsonError("Invoices for this month already exist. Refresh the page.", 409);
  return jsonError("Rent invoices could not be generated. No partial batch was kept.", 500);
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin billing changes are not allowed.", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return jsonError("A JSON request is required.", 415);
  }

  const actor = await requireActor(request, ["owner"]);
  if (!actor?.propertyId) return jsonError("Active property-owner access is required.", 401);

  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    return jsonError("The billing request is too large.", 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return jsonError("The billing request is too large.", 413);

  let body: unknown;
  try { body = JSON.parse(text); } catch { return jsonError("The billing request is invalid."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("The billing request is invalid.");
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || typeof record.period !== "string" || record.confirmGeneration !== true) {
    return jsonError("Confirm the monthly invoice generation first.");
  }
  const period = currentIndiaBillingPeriod();
  if (record.period !== period) return jsonError("Refresh the page before generating this month’s invoices.", 409);

  const { data, error } = await getSupabaseAdmin().rpc("generate_monthly_rent_invoices", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_period: period,
  });
  if (error) return rpcError(error);

  return Response.json({ generated: true, result: data }, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}

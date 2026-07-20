import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin cash changes are not allowed.", 403);
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor?.propertyId) return jsonError("Staff access is required.", 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Object.keys(body).length !== 4 || typeof body.invoiceId !== "string" || !isUuid(body.invoiceId) || !Number.isInteger(body.amount) || typeof body.collectedAt !== "string" || typeof body.note !== "string") return jsonError("Invoice, amount, collection time and note are required.");
  if (Number(body.amount) <= 0 || Number(body.amount) > 10_000_000 || Number.isNaN(Date.parse(body.collectedAt))) return jsonError("Cash details are invalid.");
  const { data, error } = await getSupabaseAdmin().rpc("record_cash_payment", { p_actor_user_id: actor.id, p_organization_id: actor.organizationId, p_property_id: actor.propertyId, p_invoice_id: body.invoiceId, p_amount: body.amount, p_collected_at: body.collectedAt, p_note: body.note.slice(0, 500) });
  if (error) return jsonError(error.message ?? "Cash could not be recorded.", error.code === "42501" ? 403 : 400);
  return Response.json({ recorded: true, payment: data }, { status: 201, headers: { "cache-control": "no-store" } });
}

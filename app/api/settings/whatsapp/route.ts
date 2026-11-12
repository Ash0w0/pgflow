import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin settings changes are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("WhatsApp settings are unavailable in the fictional demo.", 404);
  const actor = await requireActor(request, ["owner"]);
  if (!actor?.propertyId) return jsonError("Active property-owner access is required.", 401);

  const text = await request.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    const value: unknown = text.length <= 512 ? JSON.parse(text) : null;
    body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    body = null;
  }
  if (
    !body
    || Object.keys(body).length !== 3
    || typeof body.autoReminders !== "boolean"
    || typeof body.autoReceipts !== "boolean"
    || !["en", "hi"].includes(String(body.language))
  ) {
    return jsonError("Choose the reminder, receipt and language settings.");
  }

  const { data, error } = await getSupabaseAdmin().rpc("update_property_whatsapp_automation", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_auto_reminders: body.autoReminders,
    p_auto_receipts: body.autoReceipts,
    p_language: body.language,
  });
  if (error) return jsonError(error.code === "42501" ? "Owner access is required." : "The WhatsApp settings could not be saved.", error.code === "42501" ? 403 : 503);
  return Response.json({ updated: true, settings: data }, { headers: { "cache-control": "no-store" } });
}

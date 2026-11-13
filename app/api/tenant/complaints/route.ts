import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CATEGORIES = new Set(["wifi", "plumbing", "electrical", "cleaning", "food", "other"]);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_OPEN_TICKETS = 5;

/** A signed-in resident reports a problem. The resident and room come from their own record, never the request. */
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin requests are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Reporting is unavailable in the fictional demo.", 404);
  const actor = await requireActor(request, ["tenant"]);
  if (!actor?.tenantId || !actor.propertyId) return jsonError("Sign in to report a problem.", 401);

  const text = await request.text().catch(() => "");
  if (text.length > 4096) return jsonError("That message is too long.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { /* handled below */ }
  const category = typeof body?.category === "string" ? body.category : "";
  const title = typeof body?.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!body || !CATEGORIES.has(category)) return jsonError("Choose what the problem is about.");
  if (title.length < 3 || title.length > 120 || CONTROL_CHARACTERS.test(title)) return jsonError("Describe the problem in 3 to 120 characters.");
  if (description.length > 1000 || CONTROL_CHARACTERS.test(description)) return jsonError("Keep the details under 1000 characters.");

  const admin = getSupabaseAdmin();
  const [open, occupancy] = await Promise.all([
    admin.from("maintenance_tickets").select("id", { count: "exact", head: true })
      .eq("organization_id", actor.organizationId).eq("resident_id", actor.tenantId).in("status", ["open", "in_progress"]),
    admin.from("occupancies").select("bed_id")
      .eq("organization_id", actor.organizationId).eq("property_id", actor.propertyId).eq("tenant_id", actor.tenantId)
      .in("state", ["active", "notice"]).order("move_in_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (open.error || occupancy.error) return jsonError("Your report could not be saved. Try again.", 503);
  if ((open.count ?? 0) >= MAX_OPEN_TICKETS) {
    return jsonError("You already have several open reports. Please wait for the PG team to resolve one first.", 429);
  }

  let roomNumber = "Not assigned";
  if (occupancy.data?.bed_id) {
    const { data: bed } = await admin.from("beds").select("room_id").eq("organization_id", actor.organizationId).eq("id", occupancy.data.bed_id).maybeSingle();
    const { data: room } = bed
      ? await admin.from("rooms").select("code").eq("organization_id", actor.organizationId).eq("id", bed.room_id).maybeSingle()
      : { data: null };
    if (room?.code) roomNumber = room.code;
  }

  const { data, error } = await admin.rpc("create_maintenance_ticket", {
    p_actor_id: actor.id,
    p_organization_id: actor.organizationId,
    p_resident_id: actor.tenantId,
    p_room_number: roomNumber,
    p_category: category,
    p_title: title,
    p_description: description || null,
    p_priority: "medium",
  });
  if (error) return jsonError("Your report could not be saved. Try again.", 503);

  const ticketId = (data as { ticketId?: string } | null)?.ticketId ?? crypto.randomUUID();
  return Response.json({
    created: true,
    ticket: { id: ticketId, category, title, status: "open", createdAt: new Date().toISOString() },
  }, { status: 201, headers: { "cache-control": "no-store" } });
}

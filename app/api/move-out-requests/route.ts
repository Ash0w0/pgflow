import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor?.propertyId) {
    return Response.json({ error: "Property staff access is required." }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  const { data: requests, error } = await admin
    .from("move_out_requests")
    .select("id,tenant_id,requested_exit_date,state,acknowledged_at,settlement_id,created_at,updated_at")
    .eq("organization_id", actor.organizationId)
    .eq("property_id", actor.propertyId)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  const tenantIds = [...new Set((requests ?? []).map((item) => item.tenant_id))];
  const { data: residents, error: residentError } = tenantIds.length
    ? await admin
        .from("tenant_profiles")
        .select("id,full_name,phone")
        .eq("organization_id", actor.organizationId)
        .in("id", tenantIds)
    : { data: [], error: null };
  if (residentError) return Response.json({ error: residentError.message }, { status: 400 });
  const byResident = new Map((residents ?? []).map((resident) => [resident.id, resident]));
  return Response.json({
    requests: (requests ?? []).map((item) => ({
      ...item,
      resident: byResident.get(item.tenant_id) ?? null,
    })),
  }, { headers: { "cache-control": "no-store" } });
}

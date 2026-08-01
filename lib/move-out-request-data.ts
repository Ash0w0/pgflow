import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PendingMoveOutRequest = {
  id: string;
  tenantId: string;
  requestedExitDate: string;
  state: "requested" | "acknowledged" | "settlement_ready";
  acknowledgedAt: string | null;
  createdAt: string;
  resident: {
    id: string;
    fullName: string;
  } | null;
};

export async function getPendingMoveOutRequests(
  organizationId: string,
  propertyId: string,
): Promise<PendingMoveOutRequest[]> {
  const admin = getSupabaseAdmin();
  const { data: requests, error } = await admin
    .from("move_out_requests")
    .select("id,tenant_id,requested_exit_date,state,acknowledged_at,created_at")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .in("state", ["requested", "acknowledged", "settlement_ready"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Move-out requests could not be loaded: ${error.message}`);

  const tenantIds = [...new Set((requests ?? []).map((request) => request.tenant_id))];
  const { data: residents, error: residentError } = tenantIds.length > 0
    ? await admin
        .from("tenant_profiles")
        .select("id,full_name")
        .eq("organization_id", organizationId)
        .eq("property_id", propertyId)
        .in("id", tenantIds)
    : { data: [], error: null };
  if (residentError) throw new Error(`Move-out residents could not be loaded: ${residentError.message}`);
  const residentById = new Map((residents ?? []).map((resident) => [resident.id, resident]));

  return (requests ?? []).map((request) => {
    const resident = residentById.get(request.tenant_id) ?? null;
    return {
      id: request.id,
      tenantId: request.tenant_id,
      requestedExitDate: request.requested_exit_date,
      state: request.state as PendingMoveOutRequest["state"],
      acknowledgedAt: request.acknowledged_at,
      createdAt: request.created_at,
      resident: resident
        ? { id: resident.id, fullName: resident.full_name }
        : null,
    };
  });
}

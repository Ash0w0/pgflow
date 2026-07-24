import { jsonError, requireOperator } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  if (!await requireOperator(request)) {
    return jsonError("Platform operator authorization is required.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (typeof body !== "object" || body === null) {
    return jsonError("Request body must be an object", 400);
  }

  const { organizationId, residentLimit } = body as Record<string, unknown>;

  if (!organizationId || typeof organizationId !== "string") {
    return jsonError("Invalid organization ID", 400);
  }

  if (typeof residentLimit !== "number" || residentLimit < 2 || residentLimit > 100000 || !Number.isInteger(residentLimit)) {
    return jsonError("residentLimit must be an integer between 2 and 100000", 400);
  }

  const admin = getSupabaseAdmin();

  const { error: updateError } = await admin
    .from("organizations")
    .update({ resident_limit: residentLimit })
    .eq("id", organizationId);

  if (updateError) {
    return jsonError(`Failed to update resident limit: ${updateError.message}`, 500);
  }

  return Response.json({ success: true, residentLimit });
}

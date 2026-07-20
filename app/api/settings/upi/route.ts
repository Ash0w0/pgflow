import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { verifyOwnerPassword } from "@/lib/owner-reauth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requestHostname } from "@/lib/tenancy";

const MAX_BODY_BYTES = 1024;

export async function PUT(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin UPI changes are not allowed.", 403);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return jsonError("A JSON request is required.", 415);
  const actor = await requireActor(request, ["owner"]);
  if (!actor?.propertyId) return jsonError("Active property-owner access is required.", 401);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return jsonError("The UPI request is too large.", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { return jsonError("The UPI request is invalid."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("The UPI request is invalid.");
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 5 || ![record.upiId, record.payeeName, record.notePrefix, record.currentPassword, record.qrObjectKey].every((value) => typeof value === "string")) return jsonError("Complete all UPI fields and enter your current password.");

  const password = record.currentPassword as string;
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.id !== actor.id || !user.phone) return jsonError("An active owner session is required.", 401);
  const limit = await consumeAuthenticationLimits(request, requestHostname(request), user.phone).catch(() => null);
  if (!limit) return jsonError("Password protection is temporarily unavailable.", 503);
  if (!limit.allowed) return Response.json({ error: "Too many password attempts. Please wait." }, { status: 429, headers: { "cache-control": "no-store", "retry-after": String(limit.retryAfterSeconds) } });
  if (password.length < 8 || password.length > 128 || !await verifyOwnerPassword(user.id, user.phone, password)) return jsonError("Your current password is incorrect.", 401);

  const admin=getSupabaseAdmin();
  const {data:existing,error:existingError}=await admin.from("properties").select("upi_qr_object_key").eq("organization_id",actor.organizationId).eq("id",actor.propertyId).single();
  if(existingError)return jsonError("Existing UPI configuration could not be loaded.",503);
  const submittedQr=(record.qrObjectKey as string).trim();const nextQr=submittedQr||existing.upi_qr_object_key||"";
  const { data, error: rpcError } = await admin.rpc("update_property_upi", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_upi_id: (record.upiId as string).trim(),
    p_payee_name: (record.payeeName as string).trim(),
    p_note_prefix: (record.notePrefix as string).trim(),
    p_qr_object_key: nextQr,
  });
  if (rpcError) {
    if(submittedQr&&submittedQr!==existing.upi_qr_object_key)await admin.storage.from("upi-qr-assets").remove([submittedQr]).catch(()=>undefined);
    return jsonError(rpcError.code === "42501" ? "Owner access is required." : rpcError.message ?? "UPI details could not be saved.", rpcError.code === "42501" ? 403 : 400);
  }
  if(existing.upi_qr_object_key&&submittedQr&&existing.upi_qr_object_key!==submittedQr)await admin.storage.from("upi-qr-assets").remove([existing.upi_qr_object_key]).catch(()=>undefined);
  return Response.json({ updated: true, configuration: data }, { headers: { "cache-control": "no-store" } });
}

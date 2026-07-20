import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { verifyOwnerPassword } from "@/lib/owner-reauth";
import { isUuid, normalizeIndianPhone } from "@/lib/owner-invitations";
import { validateResidentEditInput } from "@/lib/resident-onboarding-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requestHostname } from "@/lib/tenancy";

const MAX_BODY_BYTES = 4096;

type JsonRecord = Record<string, unknown>;
type RouteContext = { params: Promise<{ residentId: string }> };

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function readLimitedJson(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function money(value: unknown) {
  return Number.isInteger(value) ? Number(value) : null;
}

function mutationError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return jsonError("That resident phone number is already used in this PG.", 409);
  if (error.code === "42501") return jsonError("Only the active property owner can manage this resident.", 403);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The resident change is not allowed.", 409);
  return jsonError("The resident could not be changed. Please try again.", 500);
}

async function ownerContext(request: Request, context: RouteContext) {
  if (!isTrustedMutationRequest(request)) return { error: jsonError("Cross-origin resident changes are not allowed.", 403) };
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return { error: jsonError("A JSON request is required.", 415) };
  const actor = await requireActor(request, ["owner"]);
  if (!actor || !actor.propertyId) return { error: jsonError("Active property-owner access is required.", 401) };
  const { residentId } = await context.params;
  if (!isUuid(residentId)) return { error: jsonError("The resident identifier is invalid.") };
  return { actor, residentId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorized = await ownerContext(request, context);
  if ("error" in authorized) return authorized.error;
  const body = await readLimitedJson(request);
  if (!body || Object.keys(body).length !== 10 || body.confirmUpdate !== true) {
    return jsonError("Complete and confirm the resident correction form.");
  }

  const fieldErrors = validateResidentEditInput({
    fullName: body.fullName,
    phone: body.phone,
    alternatePhone: body.alternatePhone,
    emergencyName: body.emergencyName,
    emergencyPhone: body.emergencyPhone,
    address: body.address,
    moveInDate: body.moveInDate,
    monthlyRent: body.monthlyRent,
    depositPromised: body.depositPromised,
  });
  if (Object.keys(fieldErrors).length > 0) {
    return Response.json({ error: "Please correct the highlighted fields.", fieldErrors }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  const monthlyRent = money(body.monthlyRent);
  const depositPromised = money(body.depositPromised);
  if (monthlyRent === null || depositPromised === null) return jsonError("The financial details are invalid.");

  const { data, error } = await getSupabaseAdmin().rpc("update_active_resident_details", {
    p_actor_user_id: authorized.actor.id,
    p_organization_id: authorized.actor.organizationId,
    p_property_id: authorized.actor.propertyId,
    p_tenant_id: authorized.residentId,
    p_full_name: typeof body.fullName === "string" ? body.fullName.trim() : "",
    p_phone: typeof body.phone === "string" ? normalizeIndianPhone(body.phone) : "",
    p_alternate_phone: typeof body.alternatePhone === "string" && body.alternatePhone.trim()
      ? normalizeIndianPhone(body.alternatePhone)
      : "",
    p_emergency_name: typeof body.emergencyName === "string" ? body.emergencyName.trim() : "",
    p_emergency_phone: typeof body.emergencyPhone === "string" ? normalizeIndianPhone(body.emergencyPhone) : "",
    p_address: typeof body.address === "string" ? body.address.trim() : "",
    p_move_in_date: body.moveInDate,
    p_monthly_rent: monthlyRent,
    p_deposit_promised: depositPromised,
  });
  if (error) return mutationError(error);

  return Response.json({ updated: true, resident: data }, {
    headers: { "cache-control": "no-store" },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorized = await ownerContext(request, context);
  if ("error" in authorized) return authorized.error;
  const body = await readLimitedJson(request);
  if (
    !body
    || Object.keys(body).length !== 3
    || typeof body.confirmationName !== "string"
    || typeof body.currentPassword !== "string"
    || body.confirmEmptyOnboarding !== true
  ) return jsonError("Type the exact resident name and confirm the onboarding undo.");

  const currentPassword = body.currentPassword;
  if (currentPassword.length < 8 || currentPassword.length > 128) {
    return jsonError("Your current password is incorrect.", 401);
  }
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== authorized.actor.id || !user.phone) {
    return jsonError("An active PG owner session is required.", 401);
  }
  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, requestHostname(request), user.phone);
  } catch {
    return jsonError("Password protection is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many password attempts. Please wait before trying again." },
      { status: 429, headers: { "cache-control": "no-store", "retry-after": String(limit.retryAfterSeconds) } },
    );
  }
  if (!await verifyOwnerPassword(user.id, user.phone, currentPassword)) {
    return jsonError("Your current password is incorrect.", 401);
  }

  const { data, error } = await getSupabaseAdmin().rpc("undo_empty_resident_onboarding", {
    p_actor_user_id: authorized.actor.id,
    p_organization_id: authorized.actor.organizationId,
    p_property_id: authorized.actor.propertyId,
    p_tenant_id: authorized.residentId,
    p_confirmation_name: body.confirmationName,
  });
  if (error) return mutationError(error);

  return Response.json({ undone: true, resident: data }, {
    headers: { "cache-control": "no-store" },
  });
}

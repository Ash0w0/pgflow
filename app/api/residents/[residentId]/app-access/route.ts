import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { createTemporaryPassword, isUuid, isValidIndianPhone, maskIndianPhone, normalizeIndianPhone } from "@/lib/owner-invitations";
import { MUST_CHANGE_PASSWORD_FLAG } from "@/lib/password-change-flag";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
type RouteContext = { params: Promise<{ residentId: string }> };

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return jsonError(error.message ?? "You cannot change resident app access.", 403);
  if (error.code === "P0002") return jsonError(error.message ?? "Resident not found.", 404);
  if (error.code === "P0001" || error.code === "22023") return jsonError(error.message ?? "This change is not allowed.", 409);
  return jsonError("App access could not be changed. Try again.", 503);
}

async function authorize(request: Request, context: RouteContext) {
  if (!isTrustedMutationRequest(request)) return { error: jsonError("Cross-origin access changes are not allowed.", 403) };
  if (isDemoRuntime()) return { error: jsonError("App access is unavailable in the fictional demo.", 404) };
  const actor = await requireActor(request, ["owner", "manager"]);
  if (!actor?.propertyId) return { error: jsonError("Owner or manager access is required.", 401) };
  const { residentId } = await context.params;
  if (!isUuid(residentId)) return { error: jsonError("Resident not found.", 404) };
  return { actor: { ...actor, propertyId: actor.propertyId }, residentId };
}

/** Creates the resident's login and returns a one-time password to share. */
export async function POST(request: Request, context: RouteContext) {
  const authorized = await authorize(request, context);
  if ("error" in authorized) return authorized.error;
  const { actor, residentId } = authorized;
  const admin = getSupabaseAdmin();

  const { data: resident, error: residentError } = await admin
    .from("tenant_profiles")
    .select("full_name,phone,state,membership_id")
    .eq("organization_id", actor.organizationId)
    .eq("property_id", actor.propertyId)
    .eq("id", residentId)
    .maybeSingle();
  if (residentError) return jsonError("The resident could not be loaded.", 503);
  if (!resident) return jsonError("Resident not found.", 404);
  if (resident.membership_id) return jsonError("This resident already has app access.", 409);
  if (!["active", "notice"].includes(resident.state)) return jsonError("Only current residents can be given app access.", 409);
  const phone = normalizeIndianPhone(resident.phone);
  if (!isValidIndianPhone(phone)) return jsonError("Fix this resident's phone number first. It must be a valid Indian mobile number.", 409);

  const temporaryPassword = createTemporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    phone,
    password: temporaryPassword,
    phone_confirm: true,
    app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: true },
    user_metadata: { display_name: resident.full_name },
  });
  if (createError || !created.user) {
    const exists = /already|registered|exists/i.test(createError?.message ?? "");
    return jsonError(
      exists
        ? "This phone number already has a PGFlow login (for example at another PG, or as staff here), so it can't be used for the resident app yet. Contact PGFlow."
        : "The resident login could not be created. Try again.",
      exists ? 409 : 503,
    );
  }

  const { error } = await admin.rpc("grant_resident_app_access", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_resident_id: residentId,
    p_resident_user_id: created.user.id,
  });
  if (error) {
    // Never leave an orphan login behind if the membership was refused.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return rpcError(error);
  }

  return Response.json({
    granted: true,
    access: "active",
    credential: { phone, maskedPhone: maskIndianPhone(phone), temporaryPassword },
  }, { status: 201, headers: NO_STORE });
}

/** Turns access off or on, or issues a fresh one-time password. */
export async function PATCH(request: Request, context: RouteContext) {
  const authorized = await authorize(request, context);
  if ("error" in authorized) return authorized.error;
  const { actor, residentId } = authorized;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || Object.keys(body).length !== 1 || !["disable", "enable", "reset_password"].includes(action)) {
    return jsonError("Choose an action.");
  }
  const admin = getSupabaseAdmin();

  if (action !== "reset_password") {
    const { data, error } = await admin.rpc("set_resident_app_access_state", {
      p_actor_user_id: actor.id,
      p_organization_id: actor.organizationId,
      p_resident_id: residentId,
      p_state: action === "enable" ? "active" : "disabled",
    });
    if (error) return rpcError(error);
    const authUserId = (data as { authUserId?: string } | null)?.authUserId;
    // Turning access off also ends any session that is still open.
    if (action === "disable" && authUserId) {
      await admin.auth.admin.updateUserById(authUserId, { ban_duration: "876000h" }).catch(() => undefined);
    }
    if (action === "enable" && authUserId) {
      const { error: unbanError } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: "none" });
      if (unbanError) return jsonError("Access was turned on, but the login is still blocked. Try again.", 503);
    }
    return Response.json({ updated: true, access: action === "enable" ? "active" : "disabled" }, { headers: NO_STORE });
  }

  const { data: resident, error: residentError } = await admin
    .from("tenant_profiles")
    .select("phone,membership_id")
    .eq("organization_id", actor.organizationId)
    .eq("property_id", actor.propertyId)
    .eq("id", residentId)
    .maybeSingle();
  if (residentError) return jsonError("The resident could not be loaded.", 503);
  if (!resident?.membership_id) return jsonError("This resident has no app access yet.", 404);
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("auth_user_id,phone,state")
    .eq("organization_id", actor.organizationId)
    .eq("id", resident.membership_id)
    .eq("role", "tenant")
    .maybeSingle();
  if (membershipError) return jsonError("The resident could not be loaded.", 503);
  if (!membership) return jsonError("This resident has no app access yet.", 404);
  if (membership.state !== "active") return jsonError("Turn app access on before resetting the password.", 409);

  const { data: authUser } = await admin.auth.admin.getUserById(membership.auth_user_id);
  const temporaryPassword = createTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(membership.auth_user_id, {
    password: temporaryPassword,
    app_metadata: { ...(authUser.user?.app_metadata ?? {}), [MUST_CHANGE_PASSWORD_FLAG]: true },
  });
  if (error) return jsonError("The password could not be reset. Try again.", 503);
  await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_id: actor.id,
    action: "resident.app_password_reset",
    entity_type: "tenant_profile",
    entity_id: residentId,
    after_data: { mustChangePassword: true },
  });
  return Response.json({
    reset: true,
    access: "active",
    credential: { phone: membership.phone, maskedPhone: maskIndianPhone(membership.phone), temporaryPassword },
  }, { headers: NO_STORE });
}

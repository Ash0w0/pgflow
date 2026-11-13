import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { isTrustedMutationRequest, jsonError, requireActor, type AppActor } from "@/lib/http";
import {
  createTemporaryPassword,
  isUuid,
  isValidIndianPhone,
  maskIndianPhone,
  normalizeIndianPhone,
} from "@/lib/owner-invitations";
import { verifyOwnerPassword } from "@/lib/owner-reauth";
import { MUST_CHANGE_PASSWORD_FLAG } from "@/lib/password-change-flag";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requestHostname } from "@/lib/tenancy";

const NO_STORE = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

type JsonRecord = Record<string, unknown>;

async function readJson(request: Request): Promise<JsonRecord | null> {
  const text = await request.text().catch(() => "");
  if (text.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "42501") return jsonError(error.message ?? "Only the property owner can manage the team.", 403);
  if (error.code === "P0002") return jsonError("Manager not found.", 404);
  if (error.code === "23505") return jsonError("This person already has access to this PG.", 409);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The team change is not allowed.", 409);
  return jsonError("The team change could not be saved. Try again.", 503);
}

/** Confirms the signed-in owner's own password before credential-issuing changes. */
async function confirmOwner(request: Request, actor: AppActor, password: unknown) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== actor.id || !user.phone) return jsonError("An active owner session is required.", 401);
  const limit = await consumeAuthenticationLimits(request, requestHostname(request), user.phone).catch(() => null);
  if (!limit) return jsonError("Password protection is temporarily unavailable.", 503);
  if (!limit.allowed) {
    return Response.json({ error: "Too many password attempts. Please wait." }, {
      status: 429, headers: { ...NO_STORE, "retry-after": String(limit.retryAfterSeconds) },
    });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128
    || !await verifyOwnerPassword(user.id, user.phone, password)) {
    return jsonError("Your password is incorrect. Nothing was changed.", 401);
  }
  return null;
}

export async function GET(request: Request) {
  if (isDemoRuntime()) return Response.json({ managers: [] }, { headers: NO_STORE });
  const actor = await requireActor(request, ["owner"]);
  if (!actor) return jsonError("Owner access is required.", 401);

  const { data, error } = await getSupabaseAdmin()
    .from("memberships")
    .select("id,display_name,phone,state,created_at")
    .eq("organization_id", actor.organizationId)
    .eq("role", "manager")
    .order("created_at", { ascending: true });
  if (error) return jsonError("The team could not be loaded.", 503);

  return Response.json({
    managers: (data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name,
      phone: row.phone,
      maskedPhone: maskIndianPhone(row.phone),
      state: row.state,
      createdAt: row.created_at,
    })),
  }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin team changes are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Team changes are unavailable in the fictional demo.", 404);
  const actor = await requireActor(request, ["owner"]);
  if (!actor?.propertyId) return jsonError("Active property-owner access is required.", 401);

  const body = await readJson(request);
  if (!body || Object.keys(body).some((key) => !["name", "phone", "currentPassword"].includes(key))) {
    return jsonError("Enter the manager's name, phone and your password.");
  }
  const rawName = typeof body.name === "string" ? body.name : "";
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120 || CONTROL_CHARACTERS.test(rawName)) {
    return jsonError("Manager name must be between 2 and 120 characters.");
  }
  const phone = normalizeIndianPhone(typeof body.phone === "string" ? body.phone : "");
  if (!isValidIndianPhone(phone)) return jsonError("Enter a valid Indian mobile number.");

  const denied = await confirmOwner(request, actor, body.currentPassword);
  if (denied) return denied;

  const admin = getSupabaseAdmin();
  const temporaryPassword = createTemporaryPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    phone,
    password: temporaryPassword,
    phone_confirm: true,
    app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: true },
    user_metadata: { display_name: name },
  });
  if (createError || !created.user) {
    const exists = /already|registered|exists/i.test(createError?.message ?? "");
    return jsonError(
      exists
        ? "This phone number already has a PGFlow login, so it can't be added as a new manager yet. Use a different number or contact PGFlow."
        : "The manager login could not be created. Try again.",
      exists ? 409 : 503,
    );
  }

  const { data, error } = await admin.rpc("add_organization_manager", {
    p_owner_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_manager_user_id: created.user.id,
    p_display_name: name,
    p_phone: phone,
  });
  if (error) {
    // Never leave an orphan login behind if the membership was refused.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return rpcError(error);
  }

  return Response.json({
    added: true,
    manager: data,
    credential: { phone, maskedPhone: maskIndianPhone(phone), temporaryPassword },
  }, { status: 201, headers: NO_STORE });
}

export async function PATCH(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin team changes are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Team changes are unavailable in the fictional demo.", 404);
  const actor = await requireActor(request, ["owner"]);
  if (!actor) return jsonError("Owner access is required.", 401);

  const body = await readJson(request);
  const membershipId = typeof body?.membershipId === "string" ? body.membershipId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!body || !isUuid(membershipId) || !["disable", "enable", "reset_password"].includes(action)) {
    return jsonError("Choose a manager and an action.");
  }

  // Disabling is always allowed without re-authentication; restoring or issuing credentials is not.
  if (action !== "disable") {
    const denied = await confirmOwner(request, actor, body.currentPassword);
    if (denied) return denied;
  }

  const admin = getSupabaseAdmin();
  const { data: membership, error: lookupError } = await admin
    .from("memberships")
    .select("id,auth_user_id,phone,state")
    .eq("organization_id", actor.organizationId)
    .eq("role", "manager")
    .eq("id", membershipId)
    .maybeSingle();
  if (lookupError) return jsonError("The team could not be loaded.", 503);
  if (!membership) return jsonError("Manager not found.", 404);

  if (action === "reset_password") {
    if (membership.state !== "active") return jsonError("Enable this manager before resetting their password.", 409);
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
      action: "membership.manager_password_reset",
      entity_type: "membership",
      entity_id: membership.id,
      after_data: { mustChangePassword: true },
    });
    return Response.json({
      reset: true,
      credential: { phone: membership.phone, maskedPhone: maskIndianPhone(membership.phone), temporaryPassword },
    }, { headers: NO_STORE });
  }

  const { data, error } = await admin.rpc("set_organization_manager_state", {
    p_owner_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_membership_id: membershipId,
    p_state: action === "enable" ? "active" : "disabled",
  });
  if (error) return rpcError(error);
  return Response.json({ updated: true, manager: data }, { headers: NO_STORE });
}

import { createClient } from "@supabase/supabase-js";
import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isStrongOwnerPassword } from "@/lib/passwords";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requestHostname } from "@/lib/tenancy";

const MAX_BODY_BYTES = 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function standaloneAuthClient() {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function verifyExactPassword(authUserId: string, phone: string, password: string) {
  const verifier = standaloneAuthClient();
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  const exact = !error && data.user?.id === authUserId && Boolean(data.session);
  if (data.session) await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return exact;
}

async function verifyNewPasswordAndRevokeSessions(authUserId: string, phone: string, password: string) {
  const verifier = standaloneAuthClient();
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  if (error || data.user?.id !== authUserId || !data.session) return false;
  const { error: signOutError } = await verifier.auth.signOut({ scope: "global" });
  return !signOutError;
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin password changes are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Password changes are unavailable in the fictional demo.", 404);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const actor = await requireActor(request, ["owner"]);
  if (!actor) return jsonError("An active PG owner session is required.", 401);
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== actor.id || !user.phone) {
    return jsonError("An active PG owner session is required.", 401);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonError("The password request is too large.", 413);
  }
  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return jsonError("The password request is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("Current and new passwords are required.");
  }
  if (
    !payload
    || Object.keys(payload).length !== 3
    || !Object.hasOwn(payload, "currentPassword")
    || !Object.hasOwn(payload, "newPassword")
    || !Object.hasOwn(payload, "passwordConfirmation")
  ) return jsonError("Current and new passwords are required.");

  const currentPassword = typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const confirmation = typeof payload.passwordConfirmation === "string" ? payload.passwordConfirmation : "";

  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, requestHostname(request), user.phone);
  } catch {
    return jsonError("Password-change protection is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many password attempts. Please wait before trying again." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  if (currentPassword.length < 8 || currentPassword.length > 128) {
    return jsonError("Your current password is incorrect.", 401);
  }
  if (newPassword !== confirmation) return jsonError("The two new passwords do not match.");
  if (!isStrongOwnerPassword(newPassword)) {
    return jsonError("Use 12â€“128 characters with uppercase, lowercase, a number, and a symbol.");
  }
  if (newPassword === currentPassword) return jsonError("Choose a new password different from your current password.");
  if (!await verifyExactPassword(user.id, user.phone, currentPassword)) {
    return jsonError("Your current password is incorrect.", 401);
  }

  const admin = getSupabaseAdmin();
  await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (!await verifyNewPasswordAndRevokeSessions(user.id, user.phone, newPassword)) {
    return jsonError("Password change has an uncertain state. Do not retry with a different password; ask the platform operator for help.", 503);
  }

  const { error: auditError } = await admin.from("audit_events").insert({
    organization_id: actor.organizationId,
    actor_id: actor.id,
    action: "account_password.changed",
    entity_type: "auth_user",
    entity_id: actor.id,
    after_data: { sessionsRevoked: true, method: "current_password" },
  });
  if (auditError) {
    return jsonError("Your password changed and sessions were closed, but the audit record needs operator review.", 503);
  }

  return Response.json({ changed: true, signedOut: true }, { headers: NO_STORE_HEADERS });
}

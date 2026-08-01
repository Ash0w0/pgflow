import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { jsonError, requireOperatorActor } from "@/lib/http";
import {
  verifyOperatorPassword,
  verifyOperatorPasswordAndRevokeSessions,
} from "@/lib/operator-reauth";
import { isStrongOwnerPassword } from "@/lib/passwords";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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

export async function POST(request: Request) {
  if (isDemoRuntime()) return jsonError("Operator password changes are unavailable in the fictional demo.", 404);
  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("An active platform operator session is required.", 401);

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);
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
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== operatorUserId || !user.phone) {
    return jsonError("An active platform operator session is required.", 401);
  }

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
    return jsonError("Your current operator password is incorrect.", 401);
  }
  if (newPassword !== confirmation) return jsonError("The two new passwords do not match.");
  if (!isStrongOwnerPassword(newPassword)) {
    return jsonError("Use 12–128 characters with uppercase, lowercase, a number, and a symbol.");
  }
  if (newPassword === currentPassword) return jsonError("Choose a new password different from the exposed password.");
  if (!await verifyOperatorPassword(operatorUserId, currentPassword)) {
    return jsonError("Your current operator password is incorrect.", 401);
  }

  const admin = getSupabaseAdmin();
  await admin.auth.admin.updateUserById(operatorUserId, { password: newPassword });
  if (!await verifyOperatorPasswordAndRevokeSessions(operatorUserId, newPassword)) {
    return jsonError("Password rotation has an uncertain state. Do not retry with a different password; ask for operator recovery.", 503);
  }

  await admin
    .from("platform_operators")
    .update({ updated_at: new Date().toISOString() })
    .eq("auth_user_id", operatorUserId);

  return Response.json({ changed: true, signedOut: true }, { headers: NO_STORE_HEADERS });
}

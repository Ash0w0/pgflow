import { createClient } from "@supabase/supabase-js";
import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { isTrustedMutationRequest, jsonError } from "@/lib/http";
import { isUuid, isValidIndianPhone, normalizeIndianPhone } from "@/lib/owner-invitations";
import { ownerPasswordIntentHash, ownerRecoveryCredentialHash } from "@/lib/owner-password-recovery";
import { isStrongOwnerPassword } from "@/lib/passwords";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { requestHostname, resolvePublicBrandContext } from "@/lib/tenancy";

const MAX_BODY_BYTES = 2048;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function firstRecord(value: unknown) {
  return asRecord(Array.isArray(value) ? value[0] : value);
}

async function verifyPasswordAndRevokeSessions(authUserId: string, phone: string, password: string) {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  const verifier = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ phone, password });
  if (error || !data.session || data.user?.id !== authUserId) return false;
  const { error: signOutError } = await verifier.auth.signOut({ scope: "global" });
  return !signOutError;
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin recovery is not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Password recovery is unavailable in the fictional demo.", 404);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return jsonError("The recovery request is too large.", 413);
  }

  const tenant = await resolvePublicBrandContext(request).catch(() => null);
  if (!tenant || tenant.demoMode || ["suspended", "archived"].includes(tenant.state)) {
    return jsonError("This recovery page is unavailable.", 404);
  }

  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) return jsonError("The recovery request is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("Valid recovery details are required.");
  }
  if (!payload || Object.keys(payload).length !== 5) return jsonError("Valid recovery details are required.");
  for (const key of ["phone", "credential", "newPassword", "passwordConfirmation", "recoveryRequestId"]) {
    if (!Object.hasOwn(payload, key)) return jsonError("Valid recovery details are required.");
  }

  const phone = normalizeIndianPhone(typeof payload.phone === "string" ? payload.phone : "");
  const credential = typeof payload.credential === "string" ? payload.credential : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const passwordConfirmation = typeof payload.passwordConfirmation === "string" ? payload.passwordConfirmation : "";
  const recoveryRequestId = typeof payload.recoveryRequestId === "string"
    ? payload.recoveryRequestId.trim().toLowerCase()
    : "";

  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, requestHostname(request), phone);
  } catch {
    return jsonError("Recovery protection is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many recovery attempts. Please wait before trying again." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  if (!isValidIndianPhone(phone) || credential.length !== 20) {
    return jsonError("The phone number or recovery credential is incorrect or expired.", 401);
  }
  if (!isUuid(recoveryRequestId)) return jsonError("The recovery request is invalid.");
  if (newPassword !== passwordConfirmation) return jsonError("The two passwords do not match.");
  if (!isStrongOwnerPassword(newPassword)) {
    return jsonError("Use 12â€“128 characters with uppercase, lowercase, a number, and a symbol.");
  }
  if (newPassword === credential) return jsonError("Choose a password different from the recovery credential.");

  const credentialHash = await ownerRecoveryCredentialHash(credential);
  const passwordIntentHash = await ownerPasswordIntentHash(recoveryRequestId, credential, newPassword);
  const admin = getSupabaseAdmin();

  const { data: completed, error: completedLookupError } = await admin
    .from("owner_password_recoveries")
    .select("id,auth_user_id,phone,state")
    .eq("organization_id", tenant.organizationId)
    .eq("phone", phone)
    .eq("state", "completed")
    .eq("recovery_request_id", recoveryRequestId)
    .eq("password_intent_hash", passwordIntentHash)
    .maybeSingle();
  if (completedLookupError) {
    return jsonError("Recovery status is temporarily unavailable. No password change was attempted.", 503);
  }
  if (completed) {
    const exact = await verifyPasswordAndRevokeSessions(completed.auth_user_id, completed.phone, newPassword);
    return exact
      ? Response.json({ recovered: true, reconciled: true }, { headers: NO_STORE_HEADERS })
      : jsonError("Recovery completion could not be confirmed. Ask the platform operator for help.", 409);
  }

  const { data: claimData, error: claimError } = await admin.rpc("claim_owner_password_recovery", {
    p_organization_id: tenant.organizationId,
    p_phone: phone,
    p_credential_hash: credentialHash,
    p_recovery_request_id: recoveryRequestId,
    p_password_intent_hash: passwordIntentHash,
  });
  if (claimError) {
    if (claimError.code === "P0001") {
      return jsonError("This recovery credential is already being used by another request.", 409);
    }
    if (claimError.code === "22023" || claimError.code === "P0002") {
      return jsonError("The phone number or recovery credential is incorrect or expired.", 401);
    }
    return jsonError("Recovery is temporarily unavailable. No password change was attempted.", 503);
  }
  const claim = firstRecord(claimData);
  if (
    !claim
    || typeof claim.recoveryId !== "string"
    || typeof claim.authUserId !== "string"
    || claim.organizationId !== tenant.organizationId
    || claim.phone !== phone
    || claim.recoveryRequestId !== recoveryRequestId
    || claim.passwordIntentHash !== passwordIntentHash
  ) {
    return jsonError("Recovery returned an invalid state. Ask the platform operator for help.", 503);
  }

  const alreadyUpdated = await verifyPasswordAndRevokeSessions(claim.authUserId, phone, newPassword);
  if (!alreadyUpdated) {
    await admin.auth.admin.updateUserById(claim.authUserId, { password: newPassword });
    const verified = await verifyPasswordAndRevokeSessions(claim.authUserId, phone, newPassword);
    if (!verified) {
      return jsonError("Password recovery has an uncertain state. Retry this exact request or ask the platform operator for help.", 503);
    }
  }

  const { data: completionData, error: completionError } = await admin.rpc("complete_owner_password_recovery", {
    p_recovery_id: claim.recoveryId,
    p_auth_user_id: claim.authUserId,
    p_recovery_request_id: recoveryRequestId,
    p_password_intent_hash: passwordIntentHash,
  });
  const completion = firstRecord(completionData);
  if (completionError || completion?.state !== "completed" || completion.recoveryId !== claim.recoveryId) {
    return jsonError("The password changed, but recovery logging needs operator review. Do not issue another credential yet.", 503);
  }

  return Response.json({ recovered: true, reconciled: false }, { headers: NO_STORE_HEADERS });
}

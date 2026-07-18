import { createClient, type User } from "@supabase/supabase-js";
import { isTrustedMutationRequest, jsonError } from "@/lib/http";
import {
  verifyPendingManualOwnerCredential,
  type VerifiedManualOwnerCredential,
} from "@/lib/manual-owner-activation";
import {
  isUuid,
  isSameIndianPhone,
  isValidIndianPhone,
  normalizeIndianPhone,
} from "@/lib/owner-invitations";
import { isStrongOwnerPassword } from "@/lib/passwords";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requirePublicSupabaseConfig } from "@/lib/supabase/config";
import { resolvePublicBrandContext } from "@/lib/tenancy";
import { requestHostname } from "@/lib/tenancy";
import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { reportActivationFailure } from "@/lib/activation-diagnostics";

const MAX_BODY_BYTES = 1024;
const NO_STORE_HEADERS = { "cache-control": "no-store" };

type JsonRecord = Record<string, unknown>;
type AdminClient = ReturnType<typeof getSupabaseAdmin>;
type AuthUserLookup =
  | { kind: "missing" }
  | { kind: "exact"; user: User }
  | { kind: "mismatch" }
  | { kind: "unavailable" };
type ActivationReconciliation =
  | { kind: "committed_exact" }
  | { kind: "committed_other" }
  | { kind: "pending" }
  | { kind: "rotated" }
  | { kind: "inconsistent" }
  | { kind: "unavailable" };
type CompletedRequestLookup = "committed" | "not_found" | "unavailable";
type FinalPasswordVerification = "match" | "mismatch" | "unavailable";

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function expectedAppMetadata(
  credential: VerifiedManualOwnerCredential,
  activationRequestId: string,
) {
  return {
    pgflow_activation: "manual_owner",
    pgflow_invitation_id: credential.invitationId,
    pgflow_organization_id: credential.organizationId,
    pgflow_phone_confirmation: "manual_operator",
    pgflow_activation_request_id: activationRequestId,
  };
}

function isExactActivationUser(user: User, credential: VerifiedManualOwnerCredential) {
  return user.id === credential.activationAuthUserId
    && isSameIndianPhone(user.phone, credential.phone)
    && Boolean(user.phone_confirmed_at)
    && user.app_metadata?.pgflow_activation === "manual_owner"
    && user.app_metadata?.pgflow_invitation_id === credential.invitationId
    && user.app_metadata?.pgflow_organization_id === credential.organizationId
    && user.app_metadata?.pgflow_phone_confirmation === "manual_operator";
}

function isMissingAuthUserError(error: { status?: number; code?: string } | null) {
  return error?.status === 404 || error?.code === "user_not_found";
}

function isDuplicateAuthUserError(error: { status?: number; code?: string } | null) {
  return error?.code === "user_already_exists"
    || error?.code === "phone_exists";
}

async function verifyFinalPassword(
  credential: VerifiedManualOwnerCredential,
  newPassword: string,
): Promise<FinalPasswordVerification> {
  const { url, publishableKey } = requirePublicSupabaseConfig();
  const verifier = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await verifier.auth.signInWithPassword({
    phone: credential.phone,
    password: newPassword,
  });
  if (error) {
    return error.status === 400 || error.status === 401 ? "mismatch" : "unavailable";
  }
  const matches = data.user?.id === credential.activationAuthUserId;
  if (data.session) await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return matches ? "match" : "mismatch";
}

async function lookupActivationUser(
  admin: AdminClient,
  credential: VerifiedManualOwnerCredential,
): Promise<AuthUserLookup> {
  const { data, error } = await admin.auth.admin.getUserById(credential.activationAuthUserId);
  if (error) return isMissingAuthUserError(error) ? { kind: "missing" } : { kind: "unavailable" };
  if (!data.user) return { kind: "missing" };
  return isExactActivationUser(data.user, credential)
    ? { kind: "exact", user: data.user }
    : { kind: "mismatch" };
}

async function reconcileActivation(
  admin: AdminClient,
  credential: VerifiedManualOwnerCredential,
  activationRequestId: string,
): Promise<ActivationReconciliation> {
  const [invitationResult, membershipsResult, operatorResult, authUser] = await Promise.all([
    admin
      .from("staff_invitations")
      .select("id,organization_id,property_id,state,credential_state,activation_auth_user_id,activation_request_id,auth_user_id")
      .eq("id", credential.invitationId)
      .eq("organization_id", credential.organizationId)
      .maybeSingle(),
    admin
      .from("memberships")
      .select("id,organization_id,property_id,auth_user_id,role,state")
      .eq("organization_id", credential.organizationId)
      .eq("auth_user_id", credential.activationAuthUserId)
      .limit(2),
    admin
      .from("platform_operators")
      .select("auth_user_id")
      .eq("auth_user_id", credential.activationAuthUserId)
      .limit(1),
    lookupActivationUser(admin, credential),
  ]);

  if (invitationResult.error || membershipsResult.error || operatorResult.error || authUser.kind === "unavailable") {
    return { kind: "unavailable" };
  }
  const invitation = invitationResult.data;
  const memberships = membershipsResult.data ?? [];
  if (!invitation || operatorResult.data?.length) return { kind: "inconsistent" };

  const committedAuthority = invitation.state === "accepted"
    && invitation.credential_state === "activated"
    && invitation.activation_auth_user_id === credential.activationAuthUserId
    && invitation.auth_user_id === credential.activationAuthUserId
    && memberships.length === 1
    && memberships[0].organization_id === credential.organizationId
    && memberships[0].property_id === credential.propertyId
    && memberships[0].auth_user_id === credential.activationAuthUserId
    && memberships[0].role === "owner"
    && memberships[0].state === "active"
    && authUser.kind === "exact";

  if (committedAuthority) {
    const exactRequest = invitation.activation_request_id === activationRequestId
      && authUser.kind === "exact"
      && authUser.user.app_metadata?.pgflow_activation_request_id === activationRequestId;
    return { kind: exactRequest ? "committed_exact" : "committed_other" };
  }

  if (
    invitation.state === "pending"
    && invitation.credential_state === "temporary"
    && invitation.activation_auth_user_id !== credential.activationAuthUserId
  ) {
    return { kind: "rotated" };
  }

  if (
    invitation.state === "pending"
    && invitation.credential_state === "temporary"
    && invitation.activation_auth_user_id === credential.activationAuthUserId
    && invitation.activation_request_id === null
    && invitation.auth_user_id === null
    && memberships.length === 0
    && authUser.kind === "missing"
  ) {
    return { kind: "pending" };
  }

  return { kind: "inconsistent" };
}

async function findCompletedRequest(
  admin: AdminClient,
  organizationId: string,
  phone: string,
  activationRequestId: string,
  newPassword: string,
): Promise<CompletedRequestLookup> {
  const { data, error } = await admin
    .from("staff_invitations")
    .select("id,activation_auth_user_id,organization_id,property_id,phone,display_name")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("state", "accepted")
    .eq("credential_state", "activated")
    .eq("phone", phone)
    .eq("activation_request_id", activationRequestId)
    .limit(2);

  if (error) return "unavailable";
  if (!data || data.length !== 1) return "not_found";
  const invitation = data[0];
  if (
    !isUuid(invitation.id)
    || !isUuid(invitation.activation_auth_user_id ?? "")
    || !isUuid(invitation.organization_id)
    || !isUuid(invitation.property_id)
  ) return "not_found";

  const credential: VerifiedManualOwnerCredential = {
    invitationId: invitation.id,
    activationAuthUserId: invitation.activation_auth_user_id,
    organizationId: invitation.organization_id,
    propertyId: invitation.property_id,
    phone: invitation.phone,
    displayName: invitation.display_name,
  };
  const result = await reconcileActivation(admin, credential, activationRequestId);
  if (result.kind === "unavailable") return "unavailable";
  if (result.kind !== "committed_exact") return "not_found";
  const passwordVerification = await verifyFinalPassword(credential, newPassword);
  return passwordVerification === "match"
    ? "committed"
    : passwordVerification === "unavailable"
      ? "unavailable"
      : "not_found";
}

async function readLimitedBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES) return null;
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }
}

function activationSuccess(reconciled = false) {
  return Response.json({ changed: true, activated: true, reconciled }, { headers: NO_STORE_HEADERS });
}

function reconciliationError(message: string) {
  return jsonError(message, 503, { reconciliationRequired: true, retryable: false });
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin password changes are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Password changes are unavailable in the fictional demo.", 404);

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const tenant = await resolvePublicBrandContext(request).catch(() => null);
  if (!tenant || tenant.state !== "draft") return jsonError("This owner setup is unavailable.", 404);

  const rawBody = await readLimitedBody(request);
  if (rawBody === null) return jsonError("The password request is too large or invalid.", 413);

  let payload: JsonRecord | null = null;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return jsonError("Valid owner credentials are required.");
  }
  if (
    !payload
    || Object.keys(payload).length !== 4
    || !Object.hasOwn(payload, "phone")
    || !Object.hasOwn(payload, "temporaryPassword")
    || !Object.hasOwn(payload, "newPassword")
    || !Object.hasOwn(payload, "activationRequestId")
  ) {
    return jsonError("Valid owner credentials are required.");
  }

  const phone = typeof payload.phone === "string" ? normalizeIndianPhone(payload.phone) : "";
  const temporaryPassword = typeof payload.temporaryPassword === "string" ? payload.temporaryPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";
  const activationRequestId = typeof payload.activationRequestId === "string"
    ? payload.activationRequestId.trim().toLowerCase()
    : "";
  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, requestHostname(request), phone);
  } catch {
    return jsonError("Owner setup protection is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many owner setup attempts. Please wait before trying again." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(limit.retryAfterSeconds),
        },
      },
    );
  }
  if (!isValidIndianPhone(phone) || temporaryPassword.length < 12 || temporaryPassword.length > 128) {
    return jsonError("The phone number or temporary password is incorrect.", 401);
  }
  if (!isUuid(activationRequestId)) return jsonError("The owner activation request is invalid.");
  if (!isStrongOwnerPassword(newPassword)) {
    return jsonError("Use 12–128 characters with uppercase, lowercase, a number, and a symbol.");
  }
  if (newPassword === temporaryPassword) {
    return jsonError("Choose a new password that is different from the temporary password.");
  }

  const admin = getSupabaseAdmin();
  const credential = await verifyPendingManualOwnerCredential(
    tenant.organizationId,
    phone,
    temporaryPassword,
  );
  if (!credential) {
    const completed = await findCompletedRequest(
      admin,
      tenant.organizationId,
      phone,
      activationRequestId,
      newPassword,
    );
    if (completed === "committed") return activationSuccess(true);
    if (completed === "unavailable") {
      return reconciliationError("Owner activation status could not be checked. No new account change was attempted.");
    }
    return jsonError("The phone number or temporary password is incorrect or expired.", 401);
  }

  const before = await reconcileActivation(admin, credential, activationRequestId);
  if (before.kind === "committed_exact") return activationSuccess(true);
  if (before.kind === "committed_other") {
    return jsonError("This owner account was completed by a different setup attempt. Ask the platform operator for help.", 409);
  }
  if (before.kind === "rotated") {
    return jsonError("The temporary owner password was reset. Start again with the latest password.", 409);
  }
  if (before.kind === "unavailable") {
    return reconciliationError("Owner activation status could not be checked. No account change was attempted.");
  }
  if (before.kind === "inconsistent") {
    return reconciliationError("Owner activation requires platform-operator review before it can continue.");
  }

  const authUserAttributes = {
    id: credential.activationAuthUserId,
    phone: credential.phone,
    password: newPassword,
    phone_confirm: true,
    user_metadata: { display_name: credential.displayName },
    app_metadata: expectedAppMetadata(credential, activationRequestId),
  };
  let authMutation = await admin.auth.admin.createUser(authUserAttributes);

  // The guarded auth.users trigger performs membership completion in the same
  // PostgreSQL transaction. Treat the Auth API response as potentially
  // ambiguous and reconcile persisted state before deciding success or retry.
  let after = await reconcileActivation(admin, credential, activationRequestId);
  const retryableTransportFailure = Boolean(authMutation.error)
    && (authMutation.error?.status === undefined || authMutation.error.status >= 500);
  if (after.kind === "pending" && retryableTransportFailure) {
    // Retry only after reconciliation proves that neither the Auth user nor
    // owner authority committed. The stable Auth ID and exact request ID make
    // a late first request and this retry converge on the same owner.
    authMutation = await admin.auth.admin.createUser(authUserAttributes);
    after = await reconcileActivation(admin, credential, activationRequestId);
  }
  if (authMutation.error || after.kind !== "committed_exact") {
    reportActivationFailure({
      authErrorCode: authMutation.error?.code ?? null,
      authErrorStatus: authMutation.error?.status ?? null,
      reconciliationState: after.kind,
      requestBoundToStableId: true,
    });
  }
  if (after.kind === "committed_exact") {
    if (!authMutation.error) return activationSuccess(false);
    const passwordVerification = await verifyFinalPassword(credential, newPassword);
    if (passwordVerification === "match") return activationSuccess(true);
    if (passwordVerification === "unavailable") {
      return reconciliationError("The owner account completed, but its final password could not be confirmed. Ask the platform operator for help.");
    }
    return jsonError(
      "This owner account was completed with a different private password. Ask the platform operator for help.",
      409,
    );
  }
  if (after.kind === "committed_other") {
    return jsonError("This owner account was completed by a different setup attempt. Ask the platform operator for help.", 409);
  }
  if (after.kind === "rotated") {
    return jsonError("The temporary owner password was reset during setup. Start again with the latest password.", 409);
  }
  if (after.kind === "unavailable" || after.kind === "inconsistent") {
    return reconciliationError("Owner activation has an uncertain state. The platform operator must review it; no automatic cleanup was attempted.");
  }

  if (authMutation.error && isDuplicateAuthUserError(authMutation.error)) {
    return jsonError(
      "This phone number is already attached to a different account. Ask the platform operator for help.",
      409,
      { reconciliationRequired: true, retryable: false },
    );
  }

  return jsonError(
    authMutation.error
      ? "Owner activation did not complete. You can safely retry from this page."
      : "Owner activation is still pending confirmation. You can safely retry from this page.",
    503,
    { activationState: "pending", retryable: true, reconciliationRequired: false },
  );
}

import { jsonError, requireOperatorActor } from "@/lib/http";
import {
  createTemporaryPassword,
  isUuid,
  maskIndianPhone,
  OWNER_TEMPORARY_PASSWORD_TTL_MS,
  sha256Hex,
} from "@/lib/owner-invitations";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyOperatorPassword } from "@/lib/operator-reauth";

const NO_STORE_HEADERS = { "cache-control": "no-store" };

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function firstRpcRecord(value: unknown) {
  return asRecord(Array.isArray(value) ? value[0] : value);
}

function readString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function loginUrl(request: Request, hostname: string) {
  const local = hostname === "localhost" || hostname.endsWith(".localhost");
  const requestUrl = new URL(request.url);
  const port = local && requestUrl.port ? `:${requestUrl.port}` : "";
  return new URL(`${local ? "http:" : "https:"}//${hostname}${port}/login`).toString();
}

export async function POST(request: Request) {
  if (isDemoRuntime()) return jsonError("Owner credentials are unavailable in the fictional demo.", 404);

  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("Platform operator authorization is required.", 403);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2048) {
    return jsonError("The credential reset request is too large.", 413);
  }

  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > 2048) return jsonError("The credential reset request is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("A valid JSON body is required.");
  }
  if (!payload) return jsonError("A JSON object is required.");
  if (Object.keys(payload).some((key) => !["organizationId", "manualPhoneConfirmed", "operatorPassword"].includes(key))) {
    return jsonError("The credential reset request contains an unsupported field.");
  }

  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!isUuid(organizationId)) return jsonError("A valid organization is required.");
  if (payload.manualPhoneConfirmed !== true) {
    return jsonError("Confirm that you manually verified this phone number with the owner.");
  }
  const operatorPassword = typeof payload.operatorPassword === "string" ? payload.operatorPassword : "";
  if (!await verifyOperatorPassword(operatorUserId, operatorPassword)) {
    return jsonError("Your operator password is incorrect. No credential was reset.", 401);
  }

  const admin = getSupabaseAdmin();
  const [invitationResult, domainResult] = await Promise.all([
    admin
      .from("staff_invitations")
      .select("id,display_name,phone,state,credential_state,activation_auth_user_id")
      .eq("organization_id", organizationId)
      .eq("role", "owner")
      .eq("state", "pending")
      .eq("credential_state", "temporary")
      .maybeSingle(),
    admin
      .from("domain_mappings")
      .select("hostname")
      .eq("organization_id", organizationId)
      .eq("kind", "platform_subdomain")
      .eq("state", "verified")
      .maybeSingle(),
  ]);

  if (invitationResult.error || domainResult.error) {
    return jsonError("The owner account is temporarily unavailable.", 503);
  }
  const invitation = invitationResult.data;
  if (
    !invitation
    || !isUuid(invitation.activation_auth_user_id ?? "")
    || !domainResult.data?.hostname
  ) {
    return jsonError("No temporary owner login is available to reset.", 409);
  }

  const temporaryPassword = createTemporaryPassword();
  const temporaryPasswordHash = await sha256Hex(temporaryPassword);
  const temporaryPasswordExpiresAt = new Date(
    Date.now() + OWNER_TEMPORARY_PASSWORD_TTL_MS,
  ).toISOString();
  const { data, error } = await admin.rpc("reset_manual_owner_credential", {
    p_operator_user_id: operatorUserId,
    p_organization_id: organizationId,
    p_expected_activation_auth_user_id: invitation.activation_auth_user_id,
    p_temporary_password_hash: temporaryPasswordHash,
    p_temporary_password_expires_at: temporaryPasswordExpiresAt,
  });
  if (error) {
    if (error.code === "22023" || error.code === "P0001") {
      return jsonError("The temporary owner login is no longer resettable.", 409);
    }
    if (error.code === "42501") return jsonError("Platform operator authorization is required.", 403);
    return jsonError("The temporary owner password reset could not be completed.", 503);
  }

  const result = firstRpcRecord(data);
  const credentialState = result ? readString(result, "credentialState") : null;
  const persistedExpiry = result ? readString(result, "temporaryPasswordExpiresAt") : null;
  if (
    credentialState !== "temporary"
    || !persistedExpiry
  ) {
    return jsonError("The temporary owner password reset returned an invalid result.", 503);
  }

  return Response.json({
    ownerAccount: {
      invitationId: invitation.id,
      organizationId,
      displayName: invitation.display_name,
      phone: invitation.phone,
      maskedPhone: maskIndianPhone(invitation.phone),
      temporaryPassword,
      temporaryPasswordExpiresAt: persistedExpiry,
      loginUrl: loginUrl(request, domainResult.data.hostname),
      credentialState,
    },
  }, { headers: NO_STORE_HEADERS });
}

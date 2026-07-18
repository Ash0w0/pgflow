import { jsonError, requireOperatorActor } from "@/lib/http";
import { isUuid, maskIndianPhone } from "@/lib/owner-invitations";
import {
  createOwnerRecoveryCredential,
  ownerRecoveryCredentialHash,
  OWNER_RECOVERY_TTL_MS,
} from "@/lib/owner-password-recovery";
import { verifyOperatorPassword } from "@/lib/operator-reauth";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

function recoveryUrl(request: Request, hostname: string) {
  const local = hostname === "localhost" || hostname.endsWith(".localhost");
  const requestUrl = new URL(request.url);
  const port = local && requestUrl.port ? `:${requestUrl.port}` : "";
  return new URL(`${local ? "http:" : "https:"}//${hostname}${port}/recover`).toString();
}

export async function POST(request: Request) {
  if (isDemoRuntime()) return jsonError("Password recovery is unavailable in the fictional demo.", 404);
  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("Platform operator authorization is required.", 403);

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2048) {
    return jsonError("The recovery request is too large.", 413);
  }

  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > 2048) return jsonError("The recovery request is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("A valid JSON body is required.");
  }
  if (!payload) return jsonError("A JSON object is required.");
  const allowedKeys = new Set(["organizationId", "manualPhoneConfirmed", "operatorPassword"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return jsonError("The recovery request contains an unsupported field.");
  }

  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!isUuid(organizationId)) return jsonError("A valid organization is required.");
  if (payload.manualPhoneConfirmed !== true) {
    return jsonError("Confirm that you manually verified the owner and phone number.");
  }
  const operatorPassword = typeof payload.operatorPassword === "string" ? payload.operatorPassword : "";
  if (!await verifyOperatorPassword(operatorUserId, operatorPassword)) {
    return jsonError("Your operator password is incorrect. No recovery credential was created.", 401);
  }

  const admin = getSupabaseAdmin();
  const [ownerResult, domainResult] = await Promise.all([
    admin
      .from("memberships")
      .select("id,auth_user_id,phone,display_name")
      .eq("organization_id", organizationId)
      .eq("role", "owner")
      .eq("state", "active")
      .maybeSingle(),
    admin
      .from("domain_mappings")
      .select("hostname")
      .eq("organization_id", organizationId)
      .eq("kind", "platform_subdomain")
      .eq("state", "verified")
      .maybeSingle(),
  ]);
  if (ownerResult.error || domainResult.error) return jsonError("The owner account is temporarily unavailable.", 503);
  if (!ownerResult.data || !domainResult.data?.hostname) {
    return jsonError("This PG does not have an active owner account available for recovery.", 409);
  }

  const credential = createOwnerRecoveryCredential();
  const credentialHash = await ownerRecoveryCredentialHash(credential);
  const expiresAt = new Date(Date.now() + OWNER_RECOVERY_TTL_MS).toISOString();
  const { data, error } = await admin.rpc("issue_owner_password_recovery", {
    p_operator_user_id: operatorUserId,
    p_organization_id: organizationId,
    p_credential_hash: credentialHash,
    p_expires_at: expiresAt,
  });
  if (error) {
    if (error.code === "42501") return jsonError("Platform operator authorization is required.", 403);
    if (error.code === "22023" || error.code === "P0002") {
      return jsonError("This PG does not have an eligible active owner account.", 409);
    }
    return jsonError("The owner recovery credential could not be created.", 503);
  }
  const result = firstRecord(data);
  if (
    !result
    || typeof result.recoveryId !== "string"
    || result.organizationId !== organizationId
    || result.authUserId !== ownerResult.data.auth_user_id
    || result.phone !== ownerResult.data.phone
    || typeof result.expiresAt !== "string"
    || result.state !== "issued"
  ) {
    return jsonError("The owner recovery credential returned an invalid result.", 503);
  }

  return Response.json({
    recovery: {
      recoveryId: result.recoveryId,
      organizationId,
      displayName: ownerResult.data.display_name,
      phone: ownerResult.data.phone,
      maskedPhone: maskIndianPhone(ownerResult.data.phone),
      credential,
      expiresAt: result.expiresAt,
      recoveryUrl: recoveryUrl(request, domainResult.data.hostname),
    },
  }, { status: 201, headers: NO_STORE_HEADERS });
}

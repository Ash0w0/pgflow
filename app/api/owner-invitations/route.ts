import { jsonError, requireOperatorActor } from "@/lib/http";
import {
  createInvitationToken,
  createTemporaryPassword,
  isUuid,
  isValidIndianPhone,
  maskIndianPhone,
  normalizeIndianPhone,
  OWNER_INVITATION_TTL_MS,
  OWNER_TEMPORARY_PASSWORD_TTL_MS,
  sha256Hex,
} from "@/lib/owner-invitations";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyOperatorPassword } from "@/lib/operator-reauth";

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
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
  const protocol = local ? "http:" : "https:";
  return new URL(`${protocol}//${hostname}${port}/login`).toString();
}

export async function POST(request: Request) {
  if (isDemoRuntime()) return jsonError("Owner invitations are unavailable in the fictional demo.", 404);

  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("Platform operator authorization is required.", 403);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 4096) {
    return jsonError("The owner invitation is too large.", 413);
  }

  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > 4096) return jsonError("The owner invitation is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("A valid JSON body is required.");
  }
  if (!payload) return jsonError("A JSON object is required.");

  const allowedKeys = new Set(["organizationId", "displayName", "phone", "manualPhoneConfirmed", "operatorPassword"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return jsonError("The owner invitation contains an unsupported field.");
  }

  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  if (!isUuid(organizationId)) return jsonError("A valid organization is required.");

  const rawDisplayName = typeof payload.displayName === "string" ? payload.displayName : "";
  const displayName = rawDisplayName.trim();
  if (
    displayName.length < 2
    || displayName.length > 120
    || CONTROL_CHARACTER_PATTERN.test(rawDisplayName)
  ) {
    return jsonError("Owner name must be between 2 and 120 characters and contain no control characters.");
  }

  const phone = normalizeIndianPhone(typeof payload.phone === "string" ? payload.phone : "");
  if (!isValidIndianPhone(phone)) {
    return jsonError("Enter a valid Indian mobile number.");
  }
  if (payload.manualPhoneConfirmed !== true) {
    return jsonError("Confirm that you manually verified this phone number with the owner.");
  }
  const operatorPassword = typeof payload.operatorPassword === "string" ? payload.operatorPassword : "";
  if (!await verifyOperatorPassword(operatorUserId, operatorPassword)) {
    return jsonError("Your operator password is incorrect. No owner login was created.", 401);
  }

  const admin = getSupabaseAdmin();
  const [propertiesResult, domainResult] = await Promise.all([
    admin
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(2),
    admin
      .from("domain_mappings")
      .select("hostname")
      .eq("organization_id", organizationId)
      .eq("kind", "platform_subdomain")
      .eq("state", "verified")
      .maybeSingle(),
  ]);

  if (propertiesResult.error || domainResult.error) {
    return jsonError("The PG shell is temporarily unavailable.", 503);
  }
  if (propertiesResult.data?.length !== 1 || !domainResult.data?.hostname) {
    return jsonError("The PG shell is not ready for an owner invitation.", 409);
  }

  const token = createInvitationToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + OWNER_INVITATION_TTL_MS).toISOString();

  const { data, error } = await admin.rpc("create_owner_invitation", {
    p_operator_user_id: operatorUserId,
    p_organization_id: organizationId,
    p_property_id: propertiesResult.data[0].id,
    p_display_name: displayName,
    p_phone: phone,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });

  if (error) {
    if (error.code === "22023") return jsonError("The owner invitation is invalid.", 400);
    if (error.code === "42501") return jsonError("Platform operator authorization is required.", 403);
    if (error.code === "P0001" || error.code === "23505") {
      return jsonError("This PG already has an owner account or conflicting invitation.", 409);
    }
    return jsonError("The owner invitation could not be prepared.", 503);
  }

  const result = firstRpcRecord(data);
  if (!result) return jsonError("The owner invitation returned an invalid result.", 503);

  const invitationId = readString(result, "invitationId");
  const persistedOrganizationId = readString(result, "organizationId");
  const propertyId = readString(result, "propertyId");
  const state = readString(result, "state");
  const persistedDisplayName = readString(result, "displayName");
  const persistedPhone = readString(result, "phone");
  const persistedExpiresAt = readString(result, "expiresAt");

  if (
    !invitationId
    || persistedOrganizationId !== organizationId
    || !propertyId
    || state !== "pending"
    || !persistedDisplayName
    || !persistedPhone
    || !persistedExpiresAt
  ) {
    return jsonError("The owner invitation returned an invalid result.", 503);
  }

  const temporaryPassword = createTemporaryPassword();
  const temporaryPasswordHash = await sha256Hex(temporaryPassword);
  const temporaryPasswordExpiresAt = new Date(
    Date.now() + OWNER_TEMPORARY_PASSWORD_TTL_MS,
  ).toISOString();

  const { data: bindingData, error: bindingError } = await admin.rpc("issue_manual_owner_credential", {
    p_operator_user_id: operatorUserId,
    p_invitation_id: invitationId,
    p_temporary_password_hash: temporaryPasswordHash,
    p_temporary_password_expires_at: temporaryPasswordExpiresAt,
  });

  if (bindingError) {
    if (bindingError.code === "22023") return jsonError("The owner account details are invalid.", 400);
    if (bindingError.code === "42501") return jsonError("Platform operator authorization is required.", 403);
    if (bindingError.code === "P0001" || bindingError.code === "23505") {
      return jsonError("This PG already has an owner account or conflicting invitation.", 409);
    }
    return jsonError("The temporary owner login could not be issued.", 503);
  }

  const binding = firstRpcRecord(bindingData);
  const boundInvitationId = binding ? readString(binding, "invitationId") : null;
  const boundOrganizationId = binding ? readString(binding, "organizationId") : null;
  const credentialState = binding ? readString(binding, "credentialState") : null;
  const persistedTemporaryExpiry = binding ? readString(binding, "temporaryPasswordExpiresAt") : null;
  if (
    boundInvitationId !== invitationId
    || boundOrganizationId !== persistedOrganizationId
    || credentialState !== "temporary"
    || !persistedTemporaryExpiry
  ) {
    return jsonError("The temporary owner login returned an invalid result.", 503);
  }

  return Response.json({
    ownerAccount: {
      invitationId,
      organizationId: persistedOrganizationId,
      displayName: persistedDisplayName,
      phone: persistedPhone,
      maskedPhone: maskIndianPhone(persistedPhone),
      temporaryPassword,
      temporaryPasswordExpiresAt: persistedTemporaryExpiry,
      loginUrl: loginUrl(request, domainResult.data.hostname),
      credentialState,
    },
  }, { status: 201, headers: NO_STORE_HEADERS });
}

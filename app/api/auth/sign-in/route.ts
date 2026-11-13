import { isTrustedMutationRequest, jsonError } from "@/lib/http";
import { mustChangePassword } from "@/lib/password-change-flag";
import { normalizeHostname } from "@/lib/branding";
import { isDemoRuntime } from "@/lib/runtime";
import { verifyPendingManualOwnerCredential } from "@/lib/manual-owner-activation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAccessTenantWorkspace,
  isOperationalTenant,
  requestHostname,
  resolvePublicBrandContext,
} from "@/lib/tenancy";
import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";

const INDIA_PHONE = /^\+91[6-9]\d{9}$/;
const MAX_BODY_BYTES = 1024;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
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

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value.trim();
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin sign-in is not allowed.", 403);

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const hostname = requestHostname(request);
  const operatorHostname = normalizeHostname(process.env.OPERATOR_HOSTNAME ?? null);
  const isOperatorRequest = !isDemoRuntime() && Boolean(operatorHostname) && hostname === operatorHostname;

  const tenantContext = isOperatorRequest
    ? null
    : await resolvePublicBrandContext(request).catch(() => null);
  const isDraftOwnerActivation = tenantContext?.state === "draft";
  if (!isOperatorRequest && (!tenantContext || (!isOperationalTenant(tenantContext) && !isDraftOwnerActivation))) {
    return jsonError("This PG workspace is unavailable.", 404);
  }

  const rawBody = await readLimitedBody(request);
  if (rawBody === null) return jsonError("The sign-in request is too large or invalid.", 413);

  let payload: JsonRecord | null = null;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return jsonError("A phone number and password are required.");
  }
  if (
    !payload
    || Object.keys(payload).length !== 2
    || !Object.hasOwn(payload, "phone")
    || !Object.hasOwn(payload, "password")
  ) return jsonError("A phone number and password are required.");

  const phone = normalizePhone(typeof payload.phone === "string" ? payload.phone : "");
  const password = typeof payload.password === "string" ? payload.password : "";
  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, hostname, phone);
  } catch {
    return jsonError("Sign-in protection is temporarily unavailable. Please try again shortly.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many sign-in attempts. Please wait before trying again." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(limit.retryAfterSeconds),
        },
      },
    );
  }
  if (!INDIA_PHONE.test(phone) || password.length < 8 || password.length > 128) {
    return jsonError("The phone number or password is incorrect.", 401);
  }

  if (isDraftOwnerActivation && tenantContext) {
    const credential = await verifyPendingManualOwnerCredential(
      tenantContext.organizationId,
      phone,
      password,
    );
    if (credential) {
      return Response.json({
        credentialVerified: true,
        requiresPasswordChange: true,
        nextStep: "create_private_password",
      }, { headers: { "cache-control": "no-store" } });
    }
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
  if (error || !data.user) return jsonError("The phone number or password is incorrect.", 401);

  if (isOperatorRequest) {
    const admin = getSupabaseAdmin();
    const { data: operator, error: operatorError } = await admin
      .from("platform_operators")
      .select("auth_user_id")
      .eq("auth_user_id", data.user.id)
      .eq("state", "active")
      .maybeSingle();

    if (operatorError || !operator) {
      await supabase.auth.signOut();
      return jsonError("The phone number or password is incorrect.", 401);
    }

    return Response.json({ authenticated: true, role: "platform_operator", redirectTo: "/operator" }, {
      headers: { "cache-control": "no-store" },
    });
  }

  if (!tenantContext) {
    await supabase.auth.signOut();
    return jsonError("The phone number or password is incorrect.", 401);
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id,role")
    .eq("auth_user_id", data.user.id)
    .eq("organization_id", tenantContext.organizationId)
    .eq("state", "active")
    .maybeSingle();

  if (membershipError || !membership) {
    await supabase.auth.signOut();
    return jsonError("The phone number or password is incorrect.", 401);
  }

  if (!canAccessTenantWorkspace(tenantContext, membership.role)) {
    await supabase.auth.signOut();
    return jsonError("The phone number or password is incorrect.", 401);
  }

  const passwordChangeRequired = mustChangePassword(data.user);
  return Response.json({
    authenticated: true,
    role: membership.role,
    requiresPasswordChange: passwordChangeRequired,
    redirectTo: passwordChangeRequired ? "/account/password" : membership.role === "tenant" ? "/tenant" : "/",
  }, { headers: { "cache-control": "no-store" } });
}

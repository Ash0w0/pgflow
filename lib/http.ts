import { isDemoRuntime } from "./runtime";
import { getSupabaseAdmin } from "./supabase/admin";
import { getSupabaseServerClient } from "./supabase/server";
import {
  canAccessTenantWorkspace,
  requestHostname,
  resolvePublicBrandContext,
} from "./tenancy";
import { normalizeHostname } from "./branding";

export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return Response.json({ error: message, ...details }, { status, headers: { "cache-control": "no-store" } });
}

export type AppRole = "owner" | "manager" | "accountant" | "tenant" | "platform_operator";
export type AppActor = {
  id: string;
  membershipId: string;
  organizationId: string;
  propertyId?: string;
  role: AppRole;
  tenantId?: string;
};

const developmentActors: Record<string, AppActor> = {
  "demo-tenant": { id: "user_demo_tenant", membershipId: "member_demo_tenant", organizationId: "org_demo_nivasa", role: "tenant", tenantId: "tenant_demo_mira" },
  "demo-owner": { id: "user_demo_owner", membershipId: "member_demo_owner", organizationId: "org_demo_nivasa", role: "owner" },
  "demo-accountant": { id: "user_demo_accountant", membershipId: "member_demo_accountant", organizationId: "org_demo_nivasa", role: "accountant" },
  "demo-manager": { id: "user_demo_manager", membershipId: "member_demo_manager", organizationId: "org_demo_nivasa", role: "manager" },
};

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export function isTrustedMutationRequest(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still require authentication.

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const expectedHostname = requestHostname(request);
    if (!expectedHostname || normalizeHostname(originUrl.hostname) !== expectedHostname) return false;

    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.trim().toLowerCase() ?? "";
    if (forwardedProtocol.includes(",")) return false;
    const expectedProtocol = forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol + ":"
      : requestUrl.protocol;
    if (originUrl.protocol !== expectedProtocol) return false;

    const authority = request.headers.get("host")
      ?? request.headers.get("x-forwarded-host")
      ?? requestUrl.host;
    if (authority.includes(",")) return false;
    const portMatch = authority.match(/:(\d{1,5})$/);
    const expectedPort = portMatch?.[1]
      ?? (expectedProtocol === "https:" ? "443" : expectedProtocol === "http:" ? "80" : "");
    const originPort = originUrl.port
      || (originUrl.protocol === "https:" ? "443" : originUrl.protocol === "http:" ? "80" : "");
    return expectedPort === originPort;
  } catch {
    return false;
  }
}

export async function requireActor(request: Request, allowedRoles: AppRole[]): Promise<AppActor | null> {
  if (!isTrustedMutationRequest(request)) return null;
  const supplied = bearerToken(request);
  const tenantContext = await resolvePublicBrandContext(request);
  if (!tenantContext) return null;

  if (isDemoRuntime()) {
    const actor = developmentActors[supplied];
    return actor && actor.organizationId === tenantContext.organizationId && allowedRoles.includes(actor.role) ? actor : null;
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id,organization_id,property_id,role,state")
    .eq("auth_user_id", user.id)
    .eq("organization_id", tenantContext.organizationId)
    .eq("state", "active")
    .maybeSingle();

  if (membershipError || !membership || !allowedRoles.includes(membership.role as AppRole)) return null;
  if (!canAccessTenantWorkspace(tenantContext, membership.role)) return null;

  let tenantId: string | undefined;
  if (membership.role === "tenant") {
    const { data: tenant, error: tenantError } = await supabase
      .from("tenant_profiles")
      .select("id")
      .eq("organization_id", tenantContext.organizationId)
      .eq("membership_id", membership.id)
      .eq("state", "active")
      .maybeSingle();
    if (tenantError || !tenant) return null;
    tenantId = tenant.id;
  }

  return {
    id: user.id,
    membershipId: membership.id,
    organizationId: membership.organization_id,
    propertyId: membership.property_id ?? undefined,
    role: membership.role as AppRole,
    tenantId,
  };
}

export async function requireOperatorActor(request: Request): Promise<string | null> {
  if (!isTrustedMutationRequest(request)) return null;
  const supplied = bearerToken(request);
  if (isDemoRuntime()) return supplied === "demo-operator" ? "user_demo_operator" : null;

  const operatorHostname = normalizeHostname(process.env.OPERATOR_HOSTNAME ?? null);
  const requestHost = requestHostname(request);
  if (!operatorHostname || requestHost !== operatorHostname) return null;

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const admin = getSupabaseAdmin();
  const { data: operator, error: operatorError } = await admin
    .from("platform_operators")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .eq("state", "active")
    .maybeSingle();
  if (operatorError || !operator) return null;
  return operator.auth_user_id;
}

export async function requireOperator(request: Request) {
  return Boolean(await requireOperatorActor(request));
}

export async function verifyMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = `sha256=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (actual.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}

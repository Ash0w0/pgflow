import "server-only";

import { normalizeHostname, type PublicBrand } from "./branding";
import { summarizePlan, type PlanSummary } from "./plan";
import { isDemoRuntime } from "./runtime";
import { getSupabaseAdmin } from "./supabase/admin";

export type TenantContext = PublicBrand & {
  state: "demo" | "draft" | "core_ready" | "integrations_pending" | "live" | "suspended";
  plan?: PlanSummary;
};

export function isOperationalTenant(context: TenantContext) {
  return ["demo", "core_ready", "integrations_pending", "live"].includes(context.state);
}

/** Draft workspaces are available only to their activated owner for setup. */
export function canAccessTenantWorkspace(context: TenantContext, role: string) {
  return isOperationalTenant(context) || (context.state === "draft" && role === "owner");
}

function safeHostnameCandidate(value: string | null) {
  const rawValue = value?.trim() ?? "";
  if (!rawValue || rawValue.includes(",")) return "";
  const hostname = normalizeHostname(rawValue);
  if (!hostname || hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname) || hostname.includes("..") || hostname.startsWith(".")) return "";
  return hostname;
}

export function hostnameFromHeaders(requestHeaders: Pick<Headers, "get">) {
  const host = requestHeaders.get("host");
  if (host !== null) return safeHostnameCandidate(host);
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  if (forwardedHost !== null) return safeHostnameCandidate(forwardedHost);
  return "";
}

export function requestHostname(request: Request) {
  const host = request.headers.get("host");
  if (host !== null) return safeHostnameCandidate(host);
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost !== null) return safeHostnameCandidate(forwardedHost);
  try { return safeHostnameCandidate(new URL(request.url).hostname); } catch { return ""; }
}

export async function resolvePublicBrandContextForHostname(rawHostname: string): Promise<TenantContext | null> {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) return null;

  if (isDemoRuntime()) {
    const { resolveDemoBrand } = await import("@/demo/branding");
    const demoBrand = resolveDemoBrand(hostname);
    return demoBrand ? { ...demoBrand, state: "demo" } : null;
  }

  const operatorHostname = safeHostnameCandidate(process.env.OPERATOR_HOSTNAME ?? null);
  if (operatorHostname && hostname === operatorHostname) return null;
  const admin = getSupabaseAdmin();
  const { data: mapping, error: mappingError } = await admin.from("domain_mappings").select("organization_id").eq("hostname", hostname).eq("state", "verified").maybeSingle();
  if (mappingError) throw new Error(`Hostname resolution failed: ${mappingError.message}`);
  if (!mapping) return null;

  const [{ data: organization, error: organizationError }, { data: brand, error: brandError }] = await Promise.all([
    admin.from("organizations").select("id,name,state,demo_mode,trial_ends_at,paid_until").eq("id", mapping.organization_id).maybeSingle(),
    admin.from("brand_themes").select("app_name,short_name,primary_color,accent_color").eq("organization_id", mapping.organization_id).maybeSingle(),
  ]);
  if (organizationError) throw new Error(`Organization resolution failed: ${organizationError.message}`);
  if (brandError) throw new Error(`Brand resolution failed: ${brandError.message}`);
  if (!organization || ["archived", "suspended"].includes(organization.state)) return null;
  return {
    organizationId: organization.id,
    name: brand?.app_name ?? organization.name,
    shortName: brand?.short_name ?? organization.name.slice(0, 24),
    primary: brand?.primary_color ?? "#123d32",
    accent: brand?.accent_color ?? "#d7ff86",
    startUrl: "/tenant",
    demoMode: organization.demo_mode,
    state: organization.state,
    plan: summarizePlan(organization.trial_ends_at, organization.paid_until),
  } as TenantContext;
}

export async function resolveTenantContextForHostname(rawHostname: string): Promise<TenantContext | null> {
  const context = await resolvePublicBrandContextForHostname(rawHostname);
  return context && isOperationalTenant(context) ? context : null;
}

export async function resolvePublicBrandContext(request: Request): Promise<TenantContext | null> {
  return resolvePublicBrandContextForHostname(requestHostname(request));
}

export async function resolveTenantContext(request: Request): Promise<TenantContext | null> {
  return resolveTenantContextForHostname(requestHostname(request));
}

import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeHostname } from "./branding";
import { mustChangePassword } from "./password-change-flag";
import { isDemoRuntime } from "./runtime";
import { getSupabaseAdmin } from "./supabase/admin";
import { getSupabaseServerClient } from "./supabase/server";
import {
  canAccessTenantWorkspace,
  hostnameFromHeaders,
  resolvePublicBrandContextForHostname,
  type TenantContext,
} from "./tenancy";

export type PgPageRole = "owner" | "manager" | "accountant" | "tenant";
export type StaffPageRole = Exclude<PgPageRole, "tenant">;

export type PgPageAuthorization =
  | { mode: "demo" }
  | {
      mode: "production";
      tenant: TenantContext;
      actor: {
        userId: string;
        membershipId: string;
        organizationId: string;
        propertyId?: string;
        role: PgPageRole;
        tenantId?: string;
      };
    };

export type OperatorPageAuthorization =
  | { mode: "demo" }
  | { mode: "production"; operator: { userId: string } };

function denyPageAccess(): never {
  redirect("/login");
}

function safeHostname(value: string | null) {
  const rawValue = value?.trim() ?? "";
  if (!rawValue || rawValue.includes(",")) return "";

  const hostname = normalizeHostname(rawValue);

  if (
    !hostname
    || hostname.length > 253
    || !/^[a-z0-9.-]+$/.test(hostname)
    || hostname.includes("..")
    || hostname.startsWith(".")
  ) {
    return "";
  }

  return hostname;
}

async function requestPageHostname() {
  const requestHeaders = await headers();
  return hostnameFromHeaders(requestHeaders);
}

/**
 * Authorizes a branded PG page at the page/server-component boundary.
 * Proxy session refresh remains useful, but is never the authorization gate.
 */
export async function requirePgPage(
  allowedRoles: readonly PgPageRole[],
  options: { requireActiveTenantProfile?: boolean; allowPendingPasswordChange?: boolean } = {},
): Promise<PgPageAuthorization> {
  if (isDemoRuntime()) return { mode: "demo" };

  const hostname = await requestPageHostname();
  const tenant = hostname ? await resolvePublicBrandContextForHostname(hostname) : null;
  if (!tenant) return denyPageAccess();

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return denyPageAccess();
  if (mustChangePassword(user) && !options.allowPendingPasswordChange) redirect("/account/password");

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id,organization_id,property_id,role,state")
    .eq("auth_user_id", user.id)
    .eq("organization_id", tenant.organizationId)
    .eq("state", "active")
    .maybeSingle();

  const role = membership?.role as PgPageRole | undefined;
  if (membershipError || !membership || !role || !allowedRoles.includes(role)) {
    return denyPageAccess();
  }
  if (!canAccessTenantWorkspace(tenant, role)) return denyPageAccess();

  let tenantId: string | undefined;
  if (options.requireActiveTenantProfile) {
    if (role !== "tenant") return denyPageAccess();

    const { data: tenantProfile, error: tenantError } = await supabase
      .from("tenant_profiles")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("membership_id", membership.id)
      .eq("state", "active")
      .maybeSingle();

    if (tenantError || !tenantProfile) return denyPageAccess();
    tenantId = tenantProfile.id;
  }

  return {
    mode: "production",
    tenant,
    actor: {
      userId: user.id,
      membershipId: membership.id,
      organizationId: membership.organization_id,
      propertyId: membership.property_id ?? undefined,
      role,
      tenantId,
    },
  };
}

export function requireStaffPage(allowedRoles: readonly StaffPageRole[]) {
  return requirePgPage(allowedRoles);
}

export function requireTenantPage() {
  return requirePgPage(["tenant"], { requireActiveTenantProfile: true });
}

/** Protects the private operator console independently from PG host routing. */
export async function requireOperatorPage(): Promise<OperatorPageAuthorization> {
  if (isDemoRuntime()) return { mode: "demo" };

  const hostname = await requestPageHostname();
  const operatorHostname = safeHostname(process.env.OPERATOR_HOSTNAME ?? null);
  if (!hostname || !operatorHostname || hostname !== operatorHostname) return denyPageAccess();

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return denyPageAccess();

  const { data: operator, error: operatorError } = await getSupabaseAdmin()
    .from("platform_operators")
    .select("auth_user_id")
    .eq("auth_user_id", user.id)
    .eq("state", "active")
    .maybeSingle();

  if (operatorError || !operator) return denyPageAccess();
  return { mode: "production", operator: { userId: user.id } };
}

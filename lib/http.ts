export function jsonError(message: string, status = 400, details?: Record<string, unknown>) {
  return Response.json({ error: message, ...details }, { status, headers: { "cache-control": "no-store" } });
}

export type AppRole = "owner" | "manager" | "accountant" | "tenant" | "platform_operator";
export type AppActor = { id: string; organizationId: string; role: AppRole; tenantId?: string };

const developmentActors: Record<string, AppActor> = {
  "demo-tenant": { id: "member_demo_tenant", organizationId: "org_demo_nivasa", role: "tenant", tenantId: "tenant_demo_mira" },
  "demo-owner": { id: "member_demo_owner", organizationId: "org_demo_nivasa", role: "owner" },
  "demo-accountant": { id: "member_demo_accountant", organizationId: "org_demo_nivasa", role: "accountant" },
  "demo-manager": { id: "member_demo_manager", organizationId: "org_demo_nivasa", role: "manager" },
};

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

export function requireActor(request: Request, allowedRoles: AppRole[]): AppActor | null {
  const supplied = bearerToken(request);
  if (process.env.NODE_ENV !== "production" && developmentActors[supplied]) {
    const actor = developmentActors[supplied];
    return allowedRoles.includes(actor.role) ? actor : null;
  }

  const configuredToken = process.env.APP_ACTION_TOKEN;
  if (!configuredToken || supplied !== configuredToken) return null;
  const role = request.headers.get("x-app-role") as AppRole | null;
  const id = request.headers.get("x-actor-id");
  const organizationId = request.headers.get("x-organization-id");
  if (!role || !allowedRoles.includes(role) || !id || !organizationId) return null;
  const tenantId = role === "tenant" ? request.headers.get("x-tenant-id") ?? undefined : undefined;
  if (role === "tenant" && !tenantId) return null;
  return { id, organizationId, role, tenantId };
}

export function requireOperator(request: Request) {
  const configuredKey = process.env.OPERATOR_API_KEY;
  const supplied = bearerToken(request);
  if (!configuredKey) return process.env.NODE_ENV !== "production" && supplied === "demo-operator";
  return supplied.length > 0 && supplied === configuredKey;
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

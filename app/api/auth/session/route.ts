import { jsonError, requireActor, requireOperator } from "@/lib/http";

export async function GET(request: Request) {
  if (await requireOperator(request)) {
    return Response.json({
      actor: {
        role: "platform_operator",
        organizationId: null,
        propertyId: null,
        tenantId: null,
      },
    }, { headers: { "cache-control": "no-store" } });
  }

  const actor = await requireActor(request, ["owner", "manager", "accountant", "tenant"]);
  if (!actor) return jsonError("An authenticated PG session is required.", 401);

  return Response.json({
    actor: {
      role: actor.role,
      organizationId: actor.organizationId,
      propertyId: actor.propertyId ?? null,
      tenantId: actor.tenantId ?? null,
    },
    redirectTo: actor.role === "tenant" ? "/tenant" : "/",
  }, { headers: { "cache-control": "no-store" } });
}

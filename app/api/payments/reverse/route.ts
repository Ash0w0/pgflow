import { jsonError, requireActor } from "@/lib/http";

export async function POST(request: Request) {
  const actor = requireActor(request, ["owner", "accountant"]);
  if (!actor) return jsonError("Owner or accountant access is required.", 401);
  const body = await request.json() as { paymentId?: string; reason?: string };
  if (!body.paymentId || !body.reason?.trim()) return jsonError("Payment and reversal reason are required.");
  return Response.json({
    reversal: {
      id: `rev_${crypto.randomUUID()}`,
      paymentId: body.paymentId,
      organizationId: actor.organizationId,
      requestedBy: actor.id,
      persisted: false,
      note: "Contract preview only. Approved payments remain unchanged until the ledger transaction is connected.",
    },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

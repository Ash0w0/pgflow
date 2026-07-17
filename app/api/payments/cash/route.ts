import { jsonError, requireActor } from "@/lib/http";

export async function POST(request: Request) {
  const actor = requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor) return jsonError("Owner, manager, or accountant access is required.", 401);
  const body = await request.json() as { tenantId?: string; invoiceId?: string; amount?: number; collectedAt?: string; note?: string; managerApprovalRequired?: boolean };
  if (!body.tenantId || !body.invoiceId) return jsonError("Tenant and invoice are required.");
  if (!Number.isFinite(body.amount) || Number(body.amount) <= 0) return jsonError("Amount must be greater than zero.");
  if (!body.collectedAt || Number.isNaN(Date.parse(body.collectedAt))) return jsonError("Collection time is required.");
  const requiresApproval = actor.role === "manager" && body.managerApprovalRequired !== false;
  return Response.json({
    cashEntry: {
      id: `cash_${crypto.randomUUID()}`,
      organizationId: actor.organizationId,
      receivingStaffId: actor.id,
      tenantId: body.tenantId,
      invoiceId: body.invoiceId,
      amount: Number(body.amount),
      state: requiresApproval ? "pending_review" : "approved",
      receiptIssued: false,
      persisted: false,
      note: "Contract preview only. Live use requires the transactional ledger service.",
    },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

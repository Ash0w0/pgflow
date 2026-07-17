import { jsonError, requireActor } from "@/lib/http";

const rejectionReasons = new Set(["amount_not_received", "incorrect_amount", "duplicate_utr", "invalid_screenshot", "wrong_account", "more_information_needed"]);

export async function POST(request: Request) {
  const actor = requireActor(request, ["owner", "accountant"]);
  if (!actor) return jsonError("Owner or accountant approval is required.", 401);
  const body = await request.json() as { paymentId?: string; decision?: "approve" | "reject"; reason?: string };
  if (!body.paymentId || !body.decision) return jsonError("Payment and decision are required.");
  if (body.decision === "reject" && (!body.reason || !rejectionReasons.has(body.reason))) return jsonError("A supported rejection reason is required.");
  return Response.json({
    review: {
      paymentId: body.paymentId,
      organizationId: actor.organizationId,
      reviewedBy: actor.id,
      requestedState: body.decision === "approve" ? "approved" : "rejected",
      receiptIssued: false,
      persisted: false,
      note: "No financial state changed; connect the immutable ledger transaction before enabling this action.",
    },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

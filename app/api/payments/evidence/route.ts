import { isValidUtr, normalizeUtr } from "@/lib/domain";
import { jsonError, requireActor } from "@/lib/http";

export async function POST(request: Request) {
  const actor = requireActor(request, ["tenant", "owner", "manager", "accountant"]);
  if (!actor) return jsonError("An authenticated PG session is required.", 401);
  const payload = await request.json() as { invoiceId?: string; amount?: number; utr?: string; paidAt?: string; fileHash?: string };
  if (!payload.invoiceId) return jsonError("Invoice is required.");
  if (!Number.isFinite(payload.amount) || Number(payload.amount) <= 0) return jsonError("Amount must be greater than zero.");
  if (!payload.utr || !isValidUtr(payload.utr)) return jsonError("A valid UTR or payment reference is required.");
  if (!payload.paidAt || Number.isNaN(Date.parse(payload.paidAt))) return jsonError("A valid payment date is required.");
  if (!payload.fileHash || !/^[a-f0-9]{64}$/i.test(payload.fileHash)) return jsonError("A SHA-256 screenshot evidence hash is required.");
  const paidAt = new Date(payload.paidAt);
  const dayDifference = Math.abs(Date.now() - paidAt.getTime()) / 86_400_000;
  if (dayDifference > 90) return jsonError("Payment date must be within 90 days.");

  return Response.json({
    payment: {
      id: `pay_${crypto.randomUUID()}`,
      organizationId: actor.organizationId,
      submittedBy: actor.id,
      tenantId: actor.tenantId,
      invoiceId: payload.invoiceId,
      amount: Number(payload.amount),
      utr: normalizeUtr(payload.utr),
      state: "pending_review",
      autoApproved: false,
      persisted: false,
      warnings: ["Contract preview only: connect the Supabase transaction service before accepting live evidence."],
    },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

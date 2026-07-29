import { createHash } from "node:crypto";
import { generateReceiptHtml } from "@/lib/receipt-generator";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ receiptId: string }> },
) {
  const { receiptId } = await params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (token.length < 32 || token.length > 128) {
    return Response.json({ error: "Receipt link is invalid." }, { status: 404 });
  }
  const admin = getSupabaseAdmin();
  const { data: access, error: accessError } = await admin.rpc("record_resident_receipt_open", {
    p_token_hash: tokenHash(token),
    p_receipt_id: receiptId,
  });
  if (accessError || !access) {
    return Response.json({ error: "Receipt link is invalid or expired." }, { status: 404 });
  }
  const organizationId = access.organizationId as string;
  const { data: receipt } = await admin
    .from("receipts")
    .select("id,snapshot")
    .eq("organization_id", organizationId)
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return Response.json({ error: "Receipt not found." }, { status: 404 });
  const snapshot = receipt.snapshot as Record<string, unknown> | null;
  if (!snapshot || Object.keys(snapshot).length === 0) {
    return Response.json({ error: "Receipt snapshot is unavailable." }, { status: 409 });
  }

  const html = generateReceiptHtml({
    receiptNumber: String(snapshot.receiptNumber ?? ""),
    pgName: String(snapshot.organizationName ?? snapshot.propertyName ?? "PGFlow PG"),
    pgAddress: String(snapshot.propertyAddress ?? ""),
    pgContact: String(snapshot.propertyContact ?? ""),
    residentName: String(snapshot.residentName ?? "Resident"),
    roomNumber: String(snapshot.roomNumber ?? snapshot.propertyName ?? "PG"),
    bedNumber: snapshot.bedNumber ? String(snapshot.bedNumber) : undefined,
    paymentDate: String(snapshot.paymentDate ?? snapshot.issuedAt ?? "").slice(0, 10),
    billingPeriod: String(snapshot.billingPeriod ?? "Rent"),
    paymentMethod: snapshot.paymentMethod === "cash" ? "Cash" : "UPI",
    referenceNumber: String(snapshot.paymentReference ?? "Not applicable"),
    amountPaid: Number(snapshot.amount),
    issuedBy: "PGFlow verified approval",
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    },
  });
}

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
    .select("id,property_id,payment_id,invoice_id,tenant_id,number,amount,issued_at")
    .eq("organization_id", organizationId)
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return Response.json({ error: "Receipt not found." }, { status: 404 });

  const [
    { data: organization },
    { data: property },
    { data: payment },
    { data: invoice },
    { data: tenant },
    { data: occupancy },
  ] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    admin.from("properties").select("name,address,support_phone").eq("id", receipt.property_id).maybeSingle(),
    admin.from("payments").select("method,reference,paid_at").eq("id", receipt.payment_id).maybeSingle(),
    admin.from("invoices").select("period").eq("id", receipt.invoice_id).maybeSingle(),
    admin.from("tenant_profiles").select("full_name").eq("id", receipt.tenant_id).maybeSingle(),
    admin.from("occupancies").select("bed_id").eq("organization_id", organizationId)
      .eq("tenant_id", receipt.tenant_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  let roomNumber = property?.name ?? "PG";
  let bedNumber: string | undefined;
  if (occupancy?.bed_id) {
    const { data: bed } = await admin.from("beds").select("label,room_id").eq("id", occupancy.bed_id).maybeSingle();
    if (bed) {
      bedNumber = bed.label;
      const { data: room } = await admin.from("rooms").select("code").eq("id", bed.room_id).maybeSingle();
      if (room?.code) roomNumber = room.code;
    }
  }

  const html = generateReceiptHtml({
    receiptNumber: receipt.number,
    pgName: organization?.name ?? property?.name ?? "PGFlow PG",
    pgAddress: property?.address ?? "",
    pgContact: property?.support_phone ?? "",
    residentName: tenant?.full_name ?? "Resident",
    roomNumber,
    bedNumber,
    paymentDate: String(payment?.paid_at ?? receipt.issued_at).slice(0, 10),
    billingPeriod: invoice?.period ?? "Rent",
    paymentMethod: payment?.method === "cash" ? "Cash" : "UPI",
    referenceNumber: payment?.reference ?? "Not applicable",
    amountPaid: Number(receipt.amount),
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

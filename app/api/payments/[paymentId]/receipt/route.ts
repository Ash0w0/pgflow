import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { formatReceiptNumber, generateReceiptHtml } from "@/lib/receipt-generator";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "accountant"]);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { paymentId } = await params;

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      const today = new Date().toISOString().split("T")[0];
      const receiptHtml = generateReceiptHtml({
        receiptNumber: formatReceiptNumber(paymentId, today),
        pgName: "PGFlow Sample",
        pgAddress: "14/2 Indiranagar, 10th Main, Bengaluru 560038",
        pgContact: "+91 98765 43210",
        residentName: "Mira Kapoor",
        roomNumber: "A-204",
        bedNumber: "2",
        paymentDate: today,
        billingPeriod: "July 2026",
        paymentMethod: "UPI",
        referenceNumber: "DEMO48291073",
        amountPaid: 8500,
        issuedBy: "Front Desk Manager",
      });

      return new NextResponse(receiptHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    const admin = getSupabaseAdmin();
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id,property_id,tenant_id,invoice_id,method,reference,amount,paid_at,state")
      .eq("id", paymentId)
      .eq("organization_id", actor.organizationId)
      .single();

    if (paymentError || !payment || payment.state !== "approved") {
      return NextResponse.json(
        { error: "Payment record not found or access denied." },
        { status: 404 }
      );
    }

    const [
      { data: receipt },
      { data: resident },
      { data: invoice },
      { data: property },
      { data: organization },
      { data: occupancy },
    ] = await Promise.all([
      admin.from("receipts").select("number,issued_at").eq("organization_id", actor.organizationId).eq("payment_id", payment.id).maybeSingle(),
      admin.from("tenant_profiles").select("full_name").eq("organization_id", actor.organizationId).eq("id", payment.tenant_id).maybeSingle(),
      admin.from("invoices").select("period").eq("organization_id", actor.organizationId).eq("id", payment.invoice_id).maybeSingle(),
      admin.from("properties").select("name,address,support_phone").eq("organization_id", actor.organizationId).eq("id", payment.property_id).maybeSingle(),
      admin.from("organizations").select("name").eq("id", actor.organizationId).maybeSingle(),
      admin.from("occupancies").select("bed_id").eq("organization_id", actor.organizationId).eq("tenant_id", payment.tenant_id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!receipt || !resident || !invoice || !property) {
      return NextResponse.json({ error: "Canonical receipt data is incomplete." }, { status: 409 });
    }
    let roomNumber = property.name;
    let bedNumber: string | undefined;
    if (occupancy?.bed_id) {
      const { data: bed } = await admin.from("beds").select("room_id,label").eq("id", occupancy.bed_id).maybeSingle();
      if (bed) {
        bedNumber = bed.label;
        const { data: room } = await admin.from("rooms").select("code").eq("id", bed.room_id).maybeSingle();
        if (room?.code) roomNumber = room.code;
      }
    }
    const paymentDate = new Date(payment.paid_at).toISOString().split("T")[0];

    const receiptHtml = generateReceiptHtml({
      receiptNumber: receipt.number,
      pgName: organization?.name || property.name,
      pgAddress: property.address,
      pgContact: property.support_phone,
      residentName: resident.full_name,
      roomNumber,
      bedNumber,
      paymentDate,
      billingPeriod: invoice.period,
      paymentMethod: payment.method === "cash" ? "Cash" : "UPI",
      referenceNumber: payment.reference || "Not applicable",
      amountPaid: Number(payment.amount || 0),
      issuedBy: "PGFlow verified approval",
    });

    return new NextResponse(receiptHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

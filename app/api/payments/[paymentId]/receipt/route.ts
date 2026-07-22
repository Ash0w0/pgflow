import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { formatReceiptNumber, generateReceiptHtml } from "@/lib/receipt-generator";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const actor = await requireActor(request, ["owner", "manager"]);
    const { paymentId } = await params;

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      const today = new Date().toISOString().split("T")[0];
      const receiptHtml = generateReceiptHtml({
        receiptNumber: formatReceiptNumber(paymentId, today),
        pgName: "Nivasa Demo House",
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
        issuedBy: actor.displayName || "Front Desk Manager",
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
      .select("*, invoices(*, residents(*))")
      .eq("id", paymentId)
      .eq("organization_id", actor.organizationId)
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: "Payment record not found or access denied." },
        { status: 404 }
      );
    }

    const resident = payment.invoices?.residents;
    const paymentDate = payment.created_at ? new Date(payment.created_at).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

    const receiptHtml = generateReceiptHtml({
      receiptNumber: formatReceiptNumber(payment.id, paymentDate),
      pgName: actor.organizationId ? "PGFlow Verified PG" : "PG Accommodation",
      residentName: resident?.full_name || "Resident",
      roomNumber: resident?.room_number || "Main",
      paymentDate,
      billingPeriod: payment.invoices?.billing_period || "Current Cycle",
      paymentMethod: payment.method === "cash" ? "Cash" : "UPI",
      referenceNumber: payment.reference_number || "N/A",
      amountPaid: Number(payment.amount || 0),
      issuedBy: actor.displayName || "Authorized Staff",
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

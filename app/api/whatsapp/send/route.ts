import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/client";
import {
  buildRentDueReminderPayload,
  buildPaymentReceiptPayload,
  buildDailyOwnerDigestPayload,
  getRentDueReminderPreview,
  getPaymentReceiptPreview,
  getDailyOwnerDigestPreview,
} from "@/lib/whatsapp/templates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "staff"]);
    const body = (await request.json()) as Record<string, any>;

    const { type, recipientPhone, language = "en", payload } = body;

    if (!type || !recipientPhone || !payload) {
      return NextResponse.json(
        { error: "Message type, recipient phone, and payload are required." },
        { status: 400 }
      );
    }

    let templateOptions;
    let messagePreview = "";

    if (type === "rent_due") {
      templateOptions = buildRentDueReminderPayload({
        recipientPhone,
        residentName: payload.residentName || "Resident",
        amount: Number(payload.amount || 0),
        billingPeriod: payload.billingPeriod || "Current Month",
        pgName: payload.pgName || "Nivasa PG",
        dueDate: payload.dueDate || "5th",
        paymentUrl: payload.paymentUrl || "http://localhost:3001/pay",
        language,
      });
      messagePreview = getRentDueReminderPreview({
        recipientPhone,
        residentName: payload.residentName || "Resident",
        amount: Number(payload.amount || 0),
        billingPeriod: payload.billingPeriod || "Current Month",
        pgName: payload.pgName || "Nivasa PG",
        dueDate: payload.dueDate || "5th",
        paymentUrl: payload.paymentUrl || "http://localhost:3001/pay",
        language,
      });
    } else if (type === "payment_receipt") {
      templateOptions = buildPaymentReceiptPayload({
        recipientPhone,
        residentName: payload.residentName || "Resident",
        amount: Number(payload.amount || 0),
        billingPeriod: payload.billingPeriod || "Current Month",
        receiptNumber: payload.receiptNumber || "REC-001",
        receiptUrl: payload.receiptUrl || "http://localhost:3001/receipt",
        language,
      });
      messagePreview = getPaymentReceiptPreview({
        recipientPhone,
        residentName: payload.residentName || "Resident",
        amount: Number(payload.amount || 0),
        billingPeriod: payload.billingPeriod || "Current Month",
        receiptNumber: payload.receiptNumber || "REC-001",
        receiptUrl: payload.receiptUrl || "http://localhost:3001/receipt",
        language,
      });
    } else if (type === "daily_digest") {
      templateOptions = buildDailyOwnerDigestPayload({
        ownerPhone: recipientPhone,
        ownerName: payload.ownerName || actor.displayName || "Owner",
        dateStr: payload.dateStr || new Date().toISOString().split("T")[0],
        todayCollections: Number(payload.todayCollections || 0),
        collectionsCount: Number(payload.collectionsCount || 0),
        pendingAmount: Number(payload.pendingAmount || 0),
        pendingCount: Number(payload.pendingCount || 0),
        occupiedBeds: Number(payload.occupiedBeds || 0),
        vacantBeds: Number(payload.vacantBeds || 0),
        openTickets: Number(payload.openTickets || 0),
      });
      messagePreview = getDailyOwnerDigestPreview({
        ownerPhone: recipientPhone,
        ownerName: payload.ownerName || actor.displayName || "Owner",
        dateStr: payload.dateStr || new Date().toISOString().split("T")[0],
        todayCollections: Number(payload.todayCollections || 0),
        collectionsCount: Number(payload.collectionsCount || 0),
        pendingAmount: Number(payload.pendingAmount || 0),
        pendingCount: Number(payload.pendingCount || 0),
        occupiedBeds: Number(payload.occupiedBeds || 0),
        vacantBeds: Number(payload.vacantBeds || 0),
        openTickets: Number(payload.openTickets || 0),
      });
    } else {
      return NextResponse.json(
        { error: `Unsupported WhatsApp message type: '${type}'` },
        { status: 400 }
      );
    }

    const dispatchResult = await sendWhatsAppTemplate(templateOptions);
    if (!dispatchResult.ok) {
      return NextResponse.json(
        { error: dispatchResult.error || "Failed to dispatch WhatsApp message." },
        { status: 500 }
      );
    }

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";
    if (!isDemo) {
      const admin = getSupabaseAdmin();
      await admin.rpc("log_whatsapp_message", {
        p_organization_id: actor.organizationId,
        p_recipient_phone: recipientPhone,
        p_direction: "outbound",
        p_template_name: templateOptions.templateName,
        p_language_code: language,
        p_wamid: dispatchResult.wamid || null,
        p_delivery_status: "sent",
        p_idempotency_key: payload.idempotencyKey || null,
        p_payload: { messagePreview },
        p_resident_id: payload.residentId || null,
      });
    }

    return NextResponse.json({
      ok: true,
      wamid: dispatchResult.wamid,
      demo: dispatchResult.demo || false,
      messagePreview,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

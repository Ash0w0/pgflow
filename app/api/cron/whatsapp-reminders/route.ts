import { sendWhatsAppTemplate } from "../../../../lib/whatsapp/client.ts";
import { buildRentDueReminderPayload } from "../../../../lib/whatsapp/templates.ts";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "pgflow_cron_secret";
    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    // Verify secret for cron execution unless demo mode
    if (!isDemo && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json(
        { error: "Unauthorized cron execution request." },
        { status: 401 }
      );
    }

    const todayIso = new Date().toISOString().split("T")[0];

    if (isDemo) {
      // Demo mode simulated reminder dispatch
      const sampleReminders = [
        {
          residentName: "Mira Kapoor",
          phone: "919876543210",
          amount: 8500,
          period: "July 2026",
          pgName: "Sample PG",
          dueDate: "2026-07-25",
          stage: "T-3",
        },
        {
          residentName: "Kavya Mehta",
          phone: "919876543211",
          amount: 9200,
          period: "July 2026",
          pgName: "Sample PG",
          dueDate: "2026-07-21",
          stage: "T-0",
        },
      ];

      const results = [];
      for (const item of sampleReminders) {
        const payload = buildRentDueReminderPayload({
          recipientPhone: item.phone,
          residentName: item.residentName,
          amount: item.amount,
          billingPeriod: item.period,
          pgName: item.pgName,
          dueDate: item.dueDate,
          paymentUrl: `http://localhost:3001/pay/${item.stage.toLowerCase()}`,
        });

        const dispatch = await sendWhatsAppTemplate(payload);
        results.push({
          resident: item.residentName,
          stage: item.stage,
          wamid: dispatch.wamid,
          demo: dispatch.demo,
        });
      }

      return Response.json({
        ok: true,
        processedCount: results.length,
        results,
        message: "Automated WhatsApp payment reminders dispatched in demo mode.",
      });
    }

    const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
    const admin = getSupabaseAdmin();
    // Fetch active unpaid invoices for T-3, T-0, T+2 stages
    const { data: invoices, error } = await admin
      .from("invoices")
      .select("*, residents(*), properties(*)")
      .eq("status", "pending");

    if (error) {
      return Response.json(
        { error: error.message || "Failed to query pending invoices for reminders." },
        { status: 500 }
      );
    }

    let dispatchedCount = 0;
    const logResults = [];

    for (const inv of invoices || []) {
      const resident = inv.residents;
      const property = inv.properties;

      if (!resident?.phone) continue;

      const idempotencyKey = `reminder:${inv.id}:${todayIso}`;

      const payload = buildRentDueReminderPayload({
        recipientPhone: resident.phone,
        residentName: resident.full_name,
        amount: Number(inv.amount || 0),
        billingPeriod: inv.billing_period || "Current Month",
        pgName: property?.name || "PGFlow PG",
        dueDate: inv.due_date || todayIso,
        paymentUrl: `https://${property?.slug || "app"}.pgflow.in/pay/${inv.id}`,
      });

      const dispatch = await sendWhatsAppTemplate(payload);

      if (dispatch.ok) {
        dispatchedCount++;
        await admin.rpc("log_whatsapp_message", {
          p_organization_id: inv.organization_id,
          p_recipient_phone: resident.phone,
          p_direction: "outbound",
          p_template_name: payload.templateName,
          p_wamid: dispatch.wamid || null,
          p_delivery_status: "sent",
          p_idempotency_key: idempotencyKey,
          p_resident_id: resident.id,
        });
      }

      logResults.push({
        invoiceId: inv.id,
        resident: resident.full_name,
        ok: dispatch.ok,
      });
    }

    return Response.json({
      ok: true,
      processedCount: dispatchedCount,
      logResults,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

import { authorizeCronRequest } from "../../../../lib/cron-auth.ts";
import { sendWhatsAppTemplate } from "../../../../lib/whatsapp/client.ts";
import { buildRentDueReminderPayload } from "../../../../lib/whatsapp/templates.ts";

export async function GET(request: Request) {
  try {
    const unauthorized = authorizeCronRequest(request);
    if (unauthorized) return unauthorized;
    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

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

    // Production: queue today's reminders (idempotent), then deliver the queue.
    const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
    const { processWhatsAppOutbox } = await import("../../../../lib/whatsapp/outbox.ts");
    const indiaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const { data: queued, error } = await getSupabaseAdmin().rpc("enqueue_rent_reminders", { p_today: indiaToday });
    if (error) {
      return Response.json({ error: "Reminders could not be queued." }, { status: 503 });
    }
    const delivery = await processWhatsAppOutbox({ limit: 100 });
    return Response.json({
      ok: true,
      date: indiaToday,
      queued: Number(queued ?? 0),
      delivery,
      note: delivery.configured ? undefined : "WhatsApp is not connected yet; reminders are queued and will be sent once it is.",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

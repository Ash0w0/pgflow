import { authorizeCronRequest } from "../../../../lib/cron-auth.ts";
import { logEvent } from "../../../../lib/log.ts";

/** Retries queued WhatsApp messages (receipts and reminders) that are due. */
export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;
  if (process.env.PGFLOW_RUNTIME === "demo") {
    return Response.json({ ok: true, demo: true, delivery: { configured: false, claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0 } });
  }
  try {
    const { processWhatsAppOutbox } = await import("../../../../lib/whatsapp/outbox.ts");
    const delivery = await processWhatsAppOutbox({ limit: 100 });
    logEvent(delivery.failed > 0 ? "warn" : "info", "cron.whatsapp_outbox.completed", delivery);
    return Response.json({ ok: true, delivery });
  } catch (error) {
    logEvent("error", "cron.whatsapp_outbox.failed", { error });
    return Response.json({ error: "The WhatsApp queue could not be processed." }, { status: 503 });
  }
}

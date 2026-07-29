import { requireWorkerRequest } from "@/lib/whatsapp/config";
import { drainOutbox } from "@/lib/whatsapp/outbox-worker";
import { drainWebhookEvents } from "@/lib/whatsapp/webhook-worker";
import { enqueueDueWeeklyReports } from "@/lib/whatsapp/weekly-report";
import { enqueueDueRentReminders } from "@/lib/whatsapp/rent-scheduler";

export const maxDuration = 50;

export async function POST(request: Request) {
  if (!requireWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  try {
    const reminders = await enqueueDueRentReminders();
    const weekly = await enqueueDueWeeklyReports();
    // A single inbound media download can use 25 seconds and a Meta send can
    // use another 15. Claim immediately before work so the 50-second function
    // never leases a batch it cannot safely finish.
    const webhooks = await drainWebhookEvents(`webhook:${requestId}`, 1);
    const outbox = await drainOutbox(`outbox:${requestId}`, 1);
    return Response.json({ webhooks, reminders, weekly, outbox }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "WhatsApp worker unavailable.", requestId }, { status: 503 });
  }
}

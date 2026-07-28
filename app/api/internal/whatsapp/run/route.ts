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
    const webhooks = await drainWebhookEvents(`webhook:${requestId}`, 50);
    const reminders = await enqueueDueRentReminders();
    const weekly = await enqueueDueWeeklyReports();
    const outbox = await drainOutbox(`outbox:${requestId}`, 20);
    return Response.json({ webhooks, reminders, weekly, outbox }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ error: "WhatsApp worker unavailable.", requestId }, { status: 503 });
  }
}

import { requireWorkerRequest } from "@/lib/whatsapp/config";
import { logWhatsAppWorkerFailure } from "@/lib/whatsapp/observability";
import { drainWebhookEvents } from "@/lib/whatsapp/webhook-worker";

export const maxDuration = 50;

export async function POST(request: Request) {
  if (!requireWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  try {
    const result = await drainWebhookEvents(`webhook:${requestId}`, 1);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logWhatsAppWorkerFailure("webhook", requestId, error);
    return Response.json({ error: "Webhook worker unavailable.", requestId }, { status: 503 });
  }
}

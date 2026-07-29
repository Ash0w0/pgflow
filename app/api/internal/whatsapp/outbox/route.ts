import { requireWorkerRequest } from "@/lib/whatsapp/config";
import { drainOutbox } from "@/lib/whatsapp/outbox-worker";

export const maxDuration = 50;

export async function POST(request: Request) {
  if (!requireWorkerRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
  try {
    const result = await drainOutbox(`outbox:${requestId}`, 2);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Outbox worker unavailable.", requestId }, { status: 503 });
  }
}

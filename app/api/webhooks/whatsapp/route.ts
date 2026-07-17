import { jsonError, verifyMetaSignature } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !challenge || token !== process.env.WHATSAPP_VERIFY_TOKEN) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = await verifyMetaSignature(rawBody, request.headers.get("x-hub-signature-256"));
  if (!valid) return jsonError("Invalid webhook signature.", 401);

  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return jsonError("Webhook payload must be valid JSON."); }

  return Response.json({
    accepted: true,
    queued: false,
    integrationReady: false,
    note: "Signature verified. Durable webhook storage must be enabled before connecting a production Meta number.",
    eventType: typeof payload === "object" && payload !== null && "object" in payload ? "whatsapp_business_account" : "unknown",
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

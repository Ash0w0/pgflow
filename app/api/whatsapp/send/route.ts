import { requireActor } from "@/lib/http";
import {
  enqueueWhatsAppIntent,
  parseWhatsAppIntent,
  resolveWhatsAppIntent,
} from "@/lib/whatsapp/intents";

export async function POST(request: Request) {
  const actor = await requireActor(request, ["owner", "manager", "accountant"]);
  if (!actor) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON intent is required." }, { status: 400 });
  }
  const intent = parseWhatsAppIntent(body);
  if (!intent) return Response.json({ error: "Invalid WhatsApp intent." }, { status: 400 });

  try {
    const context = await resolveWhatsAppIntent({
      organizationId: actor.organizationId,
      membershipId: actor.membershipId,
      propertyId: actor.propertyId,
    }, intent);
    const result = await enqueueWhatsAppIntent(context);
    return Response.json(result, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to enqueue WhatsApp intent.";
    return Response.json({ error: message }, { status: 409 });
  }
}

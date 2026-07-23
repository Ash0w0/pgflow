import { normalizeWhatsAppPhone } from "../../../../lib/whatsapp/client.ts";

/**
 * GET Handler - Meta WhatsApp Webhook Verification Challenge
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
 * We must respond with raw hub.challenge text and HTTP 200 OK.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const validTokens = new Set(
    [
      (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim(),
      "pgflow_webhook_verify_token",
      "pgflow_wh_verify_secret_2026",
    ].filter(Boolean)
  );

  if (mode === "subscribe" && token && validTokens.has(token)) {
    return new Response(challenge ?? "OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return Response.json(
    { error: "Forbidden. Invalid webhook verify token." },
    { status: 403 }
  );
}

/**
 * POST Handler - Ingest Meta WhatsApp Webhook Events (Statuses & Inbound Proof Screenshots)
 */
export async function POST(request: Request) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await request.json()) as Record<string, any>;
    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    const entryList = Array.isArray(body.entry) ? body.entry : [];
    const entry = (entryList[0] && typeof entryList[0] === "object" ? entryList[0] : null) as Record<string, unknown> | null;
    const changesList = entry && Array.isArray(entry.changes) ? entry.changes : [];
    const changeObj = (changesList[0] && typeof changesList[0] === "object" ? changesList[0] : null) as Record<string, unknown> | null;
    const change = (changeObj?.value && typeof changeObj.value === "object" ? changeObj.value : null) as Record<string, unknown> | null;

    if (!change) {
      return Response.json({ ok: true, note: "Empty or unrecognized payload structure." });
    }

    // Process delivery status updates (sent, delivered, read)
    const statuses = change.statuses;
    if (Array.isArray(statuses) && statuses.length > 0) {
      for (const statusObj of statuses) {
        const wamid = statusObj.id;
        const recipientPhone = statusObj.recipient_id;
        const statusStr = statusObj.status; // 'sent' | 'delivered' | 'read' | 'failed'

        if (!isDemo && recipientPhone) {
          const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
          const admin = getSupabaseAdmin();
          await admin
            .from("whatsapp_message_logs")
            .update({
              delivery_status: statusStr,
              updated_at: new Date().toISOString(),
            })
            .eq("wamid", wamid);
        }
      }
    }

    // Process incoming resident messages (payment proof screenshots or text replies)
    const messages = change.messages;
    if (Array.isArray(messages) && messages.length > 0) {
      for (const msg of messages) {
        const fromPhoneRaw = msg.from; // e.g. "919876543210"
        let normalizedPhone = "";
        try {
          normalizedPhone = normalizeWhatsAppPhone(fromPhoneRaw);
        } catch {
          normalizedPhone = fromPhoneRaw;
        }

        const msgType = msg.type; // 'image' | 'text' | etc.

        if (msgType === "image") {
          const imageObj = msg.image;
          const mediaId = imageObj?.id;
          const caption = imageObj?.caption || "Payment screenshot via WhatsApp";

          if (isDemo) {
            return Response.json({
              ok: true,
              ingested: true,
              type: "image_proof",
              senderPhone: normalizedPhone,
              mediaId,
              caption,
              status: "queued_for_review",
              message: "Demo UPI payment proof screenshot ingested into Collections queue.",
            });
          }

          // Production DB Ingestion
          const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
          const admin = getSupabaseAdmin();
          await admin.rpc("log_whatsapp_message", {
            p_organization_id: "00000000-0000-0000-0000-000000000000",
            p_recipient_phone: normalizedPhone,
            p_direction: "inbound",
            p_template_name: "inbound_image_proof",
            p_wamid: msg.id,
            p_delivery_status: "delivered",
            p_payload: { mediaId, caption, msgType: "image" },
          });
        }
      }
    }

    return Response.json({ ok: true, status: "processed" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

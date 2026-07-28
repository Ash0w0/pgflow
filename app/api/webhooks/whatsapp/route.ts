import { verifyMetaSignature } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireWebhookConfig } from "@/lib/whatsapp/config";

type MetaValue = {
  metadata?: { phone_number_id?: string };
  messages?: Array<{ id?: string; timestamp?: string; type?: string } & Record<string, unknown>>;
  statuses?: Array<{ id?: string; timestamp?: string; status?: string } & Record<string, unknown>>;
  errors?: Array<{ code?: number | string } & Record<string, unknown>>;
};

type MetaPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaValue }>;
  }>;
};

export async function GET(request: Request) {
  const config = requireWebhookConfig();
  const query = new URL(request.url).searchParams;
  const valid = query.get("hub.mode") === "subscribe"
    && query.get("hub.verify_token") === config.verifyToken;
  return valid
    ? new Response(query.get("hub.challenge") ?? "", {
        status: 200,
        headers: { "content-type": "text/plain", "cache-control": "no-store" },
      })
    : Response.json({ error: "Forbidden." }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const config = requireWebhookConfig();
  if (config.runtime !== "demo") {
    const valid = await verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );
    if (!valid) return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  let body: MetaPayload;
  try {
    body = JSON.parse(rawBody) as MetaPayload;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (config.runtime === "demo") {
    return Response.json({ ok: true, persisted: 0, demo: true });
  }

  const admin = getSupabaseAdmin();
  const rows: Array<Record<string, unknown>> = [];
  for (const [entryIndex, entry] of (body.entry ?? []).entries()) {
    for (const [changeIndex, change] of (entry.changes ?? []).entries()) {
      const value = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      const base = `${entry.id ?? entryIndex}:${changeIndex}`;

      for (const message of value.messages ?? []) {
        if (!message.id) continue;
        rows.push({
          provider_event_key: `message:${message.id}`,
          entry_id: entry.id ?? null,
          phone_number_id: phoneNumberId,
          event_kind: "message",
          provider_wamid: message.id,
          payload: { field: change.field, value: message, metadata: value.metadata },
        });
      }
      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status || !status.timestamp) continue;
        rows.push({
          provider_event_key: `status:${status.id}:${status.status}:${status.timestamp}`,
          entry_id: entry.id ?? null,
          phone_number_id: phoneNumberId,
          event_kind: "status",
          provider_wamid: status.id,
          payload: { field: change.field, value: status, metadata: value.metadata },
        });
      }
      for (const [errorIndex, providerError] of (value.errors ?? []).entries()) {
        rows.push({
          provider_event_key: `error:${base}:${errorIndex}:${String(providerError.code ?? "unknown")}`,
          entry_id: entry.id ?? null,
          phone_number_id: phoneNumberId,
          event_kind: "error",
          payload: { field: change.field, value: providerError, metadata: value.metadata },
        });
      }
    }
  }

  if (rows.length === 0) return Response.json({ ok: true, persisted: 0 });

  const phoneIds = [...new Set(rows.map((row) => row.phone_number_id).filter(Boolean))] as string[];
  const { data: connections, error: connectionError } = await admin
    .from("whatsapp_connections")
    .select("id,phone_number_id")
    .in("phone_number_id", phoneIds);
  if (connectionError) return Response.json({ error: "Webhook persistence unavailable." }, { status: 503 });
  const byPhone = new Map((connections ?? []).map((item) => [item.phone_number_id, item.id]));
  const persistedRows = rows.map((row) => ({
    ...row,
    connection_id: byPhone.get(String(row.phone_number_id)) ?? null,
  }));

  const { error } = await admin
    .from("whatsapp_webhook_events")
    .upsert(persistedRows, { onConflict: "provider_event_key", ignoreDuplicates: true });
  if (error) return Response.json({ error: "Webhook persistence unavailable." }, { status: 503 });

  return Response.json({ ok: true, persisted: persistedRows.length });
}

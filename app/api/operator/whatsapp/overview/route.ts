import { requireOperator } from "@/lib/http";
import { getWhatsAppSendMode } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWhatsAppDegradedReasons,
  secondsSince,
} from "@/lib/whatsapp/readiness";
import { expectedTemplateSchemas } from "@/lib/whatsapp/template-schema";

export async function GET(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const results = await Promise.all([
    admin.from("whatsapp_connections").select("id,label,state,graph_version,last_template_sync_at,last_verified_at"),
    admin.from("whatsapp_templates").select("connection_id,purpose,meta_name,language_code,approval_state,quality_state,last_synced_at")
      .order("purpose").order("language_code"),
    admin.from("whatsapp_conversations").select("*", { count: "exact", head: true })
      .in("state", ["awaiting_pg", "operator_review"]),
    admin.from("whatsapp_outbox_jobs").select("id,state,attempts,created_at,last_error_code", { count: "exact" })
      .in("state", ["queued", "retry_wait", "leased"]).order("created_at").limit(50),
    admin.from("whatsapp_outbox_jobs").select("id,message_id,attempts,created_at,last_error_code", { count: "exact" })
      .eq("state", "dead_letter").order("created_at", { ascending: false }).limit(50),
    admin.from("whatsapp_webhook_events").select("id,event_kind,state,attempts,received_at", { count: "exact" })
      .in("state", ["pending", "retry_wait", "leased"]).order("received_at").limit(50),
    admin.from("whatsapp_webhook_events").select("id,event_kind,attempts,received_at", { count: "exact" })
      .eq("state", "dead_letter").order("received_at", { ascending: false }).limit(50),
    admin.from("whatsapp_worker_heartbeats").select("worker,environment,last_completed_at,last_result"),
  ]);
  const queryError = results.find((result) => result.error)?.error;
  if (queryError) {
    return Response.json({ error: "WhatsApp operations could not be loaded." }, { status: 503 });
  }
  const [
    { data: connections },
    { data: templates },
    { count: unresolved },
    { data: backlog, count: backlogCount },
    { data: deadLetters, count: deadLetterCount },
    { data: webhookBacklog, count: webhookBacklogCount },
    { data: webhookDeadLetters, count: webhookDeadLetterCount },
    { data: heartbeats },
  ] = results;
  const connection = connections?.find((item) => ["test", "live"].includes(item.state))
    ?? connections?.[0]
    ?? null;
  const approvedTemplateKeys = new Set(
    (templates ?? [])
      .filter((template) => template.connection_id === connection?.id && template.approval_state === "approved")
      .map((template) => `${template.purpose}:${template.language_code}`),
  );
  const requiredTemplateKeys = Object.keys(expectedTemplateSchemas)
    .flatMap((purpose) => [`${purpose}:en`, `${purpose}:hi`]);
  const workerAges = new Map((heartbeats ?? []).map((heartbeat) => [
    heartbeat.worker,
    secondsSince(heartbeat.last_completed_at),
  ]));
  const degradedReasons = getWhatsAppDegradedReasons({
    sendMode: getWhatsAppSendMode(),
    connectionState: connection?.state ?? null,
    templatesReady: requiredTemplateKeys.every((key) => approvedTemplateKeys.has(key)),
    outboxWorkerAgeSeconds: workerAges.get("outbox") ?? null,
    webhookWorkerAgeSeconds: workerAges.get("webhook") ?? null,
    oldestOutboxAgeSeconds: secondsSince(backlog?.[0]?.created_at),
    oldestWebhookAgeSeconds: secondsSince(webhookBacklog?.[0]?.received_at),
    outboxDeadLetters: deadLetterCount ?? 0,
    webhookDeadLetters: webhookDeadLetterCount ?? 0,
  });
  return Response.json({
    status: degradedReasons.length === 0 ? "ready" : "degraded",
    degradedReasons,
    connections: connections ?? [],
    templates: templates ?? [],
    unresolved: unresolved ?? 0,
    backlog: backlog ?? [],
    backlogCount: backlogCount ?? 0,
    deadLetters: deadLetters ?? [],
    deadLetterCount: deadLetterCount ?? 0,
    webhookBacklog: webhookBacklog ?? [],
    webhookBacklogCount: webhookBacklogCount ?? 0,
    webhookDeadLetters: webhookDeadLetters ?? [],
    webhookDeadLetterCount: webhookDeadLetterCount ?? 0,
    heartbeats: heartbeats ?? [],
  }, { headers: { "cache-control": "no-store" } });
}

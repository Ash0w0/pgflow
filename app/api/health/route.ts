import { isDemoRuntime, getWhatsAppSendMode } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";
import {
  getWhatsAppDegradedReasons,
  secondsSince,
} from "@/lib/whatsapp/readiness";
import { expectedTemplateSchemas } from "@/lib/whatsapp/template-schema";

export async function GET() {
  const checkedAt = new Date().toISOString();
  if (isDemoRuntime()) {
    return Response.json({
      status: "prototype",
      demoMode: true,
      livePayments: false,
      liveWhatsApp: false,
      persistence: "fictional-demo",
      checkedAt,
    }, { headers: { "cache-control": "no-store" } });
  }

  try {
    if (!readPublicSupabaseConfig()) throw new Error("Missing database configuration.");
    const admin = getSupabaseAdmin();
    const [
      migrationResult,
      connectionResult,
      templatesResult,
      heartbeatResult,
      outboxQueueResult,
      outboxDeadLetterResult,
      webhookQueueResult,
      webhookDeadLetterResult,
    ] = await Promise.all([
      admin.from("pgflow_release_sentinels").select("key").eq("key", "production_whatsapp_runtime_v1").maybeSingle(),
      admin.from("whatsapp_connections").select("id,state,last_verified_at").eq("phone_number_id", process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").maybeSingle(),
      admin.from("whatsapp_templates").select("connection_id,purpose,language_code").eq("approval_state", "approved"),
      admin.from("whatsapp_worker_heartbeats").select("worker,last_completed_at,last_result")
        .in("worker", ["outbox", "webhook"]),
      admin.from("whatsapp_outbox_jobs").select("created_at", { count: "exact" })
        .in("state", ["queued", "retry_wait", "leased"])
        .order("created_at").limit(1).maybeSingle(),
      admin.from("whatsapp_outbox_jobs").select("*", { head: true, count: "exact" }).eq("state", "dead_letter"),
      admin.from("whatsapp_webhook_events").select("received_at", { count: "exact" })
        .in("state", ["pending", "retry_wait", "leased"])
        .order("received_at").limit(1).maybeSingle(),
      admin.from("whatsapp_webhook_events").select("*", { head: true, count: "exact" }).eq("state", "dead_letter"),
    ]);
    const queryError = [
      migrationResult.error,
      connectionResult.error,
      templatesResult.error,
      heartbeatResult.error,
      outboxQueueResult.error,
      outboxDeadLetterResult.error,
      webhookQueueResult.error,
      webhookDeadLetterResult.error,
    ].find(Boolean);
    if (queryError) throw queryError;
    if (!migrationResult.data) {
      throw new Error("Production WhatsApp runtime migration is missing.");
    }
    const connection = connectionResult.data;
    const heartbeats = heartbeatResult.data;
    const oldestOutbox = outboxQueueResult.data;
    const oldestWebhook = webhookQueueResult.data;
    const outboxDeadLetters = outboxDeadLetterResult.count ?? 0;
    const webhookDeadLetters = webhookDeadLetterResult.count ?? 0;
    const approvedTemplateKeys = new Set(
      (templatesResult.data ?? [])
        .filter((template) => template.connection_id === connection?.id)
        .map((template) => `${template.purpose}:${template.language_code}`),
    );
    const requiredTemplateKeys = Object.keys(expectedTemplateSchemas)
      .flatMap((purpose) => [`${purpose}:en`, `${purpose}:hi`]);
    const approvedTemplates = requiredTemplateKeys
      .filter((key) => approvedTemplateKeys.has(key)).length;
    const templatesReady = approvedTemplates === requiredTemplateKeys.length;
    const sendMode = getWhatsAppSendMode();
    const workerAges = new Map((heartbeats ?? []).map((heartbeat) => [
      heartbeat.worker,
      secondsSince(heartbeat.last_completed_at),
    ]));
    const outboxWorkerAgeSeconds = workerAges.get("outbox") ?? null;
    const webhookWorkerAgeSeconds = workerAges.get("webhook") ?? null;
    const oldestOutboxAgeSeconds = secondsSince(oldestOutbox?.created_at);
    const oldestWebhookAgeSeconds = secondsSince(oldestWebhook?.received_at);
    const degradedReasons = getWhatsAppDegradedReasons({
      sendMode,
      connectionState: connection?.state ?? null,
      templatesReady,
      outboxWorkerAgeSeconds,
      webhookWorkerAgeSeconds,
      oldestOutboxAgeSeconds,
      oldestWebhookAgeSeconds,
      outboxDeadLetters,
      webhookDeadLetters,
    });
    const messagingReady = degradedReasons.length === 0;
    return Response.json({
      status: messagingReady ? "ready" : "degraded",
      reasons: degradedReasons,
      demoMode: false,
      website: "ready",
      database: "reachable",
      migrations: "production-whatsapp-runtime-v1-present",
      messaging: {
        sendMode,
        connection: connection?.state ?? "missing",
        approvedTemplates,
        requiredTemplates: requiredTemplateKeys.length,
        outboxWorkerAgeSeconds,
        webhookWorkerAgeSeconds,
        outboxBacklog: outboxQueueResult.count ?? 0,
        webhookBacklog: webhookQueueResult.count ?? 0,
        oldestOutboxAgeSeconds,
        oldestWebhookAgeSeconds,
        outboxDeadLetters,
        webhookDeadLetters,
      },
      checkedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      reasons: ["database_unavailable"],
      demoMode: false,
      website: "ready",
      database: "unavailable",
      checkedAt,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

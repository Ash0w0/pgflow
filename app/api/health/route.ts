import { isDemoRuntime, getWhatsAppSendMode } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";
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
    const [migrationResult, connectionResult, templatesResult, heartbeatResult, queueResult, deadLetterResult] = await Promise.all([
      admin.from("move_out_requests").select("property_id", { head: true, count: "exact" }).limit(1),
      admin.from("whatsapp_connections").select("id,state,last_verified_at").eq("phone_number_id", process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").maybeSingle(),
      admin.from("whatsapp_templates").select("connection_id,purpose,language_code").eq("approval_state", "approved"),
      admin.from("whatsapp_worker_heartbeats").select("worker,last_completed_at,last_result")
        .in("worker", ["outbox", "webhook"]),
      admin.from("whatsapp_outbox_jobs").select("created_at").in("state", ["queued", "retry_wait"])
        .order("created_at").limit(1).maybeSingle(),
      admin.from("whatsapp_outbox_jobs").select("*", { head: true, count: "exact" }).eq("state", "dead_letter"),
    ]);
    const queryError = [
      migrationResult.error,
      connectionResult.error,
      templatesResult.error,
      heartbeatResult.error,
      queueResult.error,
      deadLetterResult.error,
    ].find(Boolean);
    if (queryError) throw queryError;
    const connection = connectionResult.data;
    const heartbeats = heartbeatResult.data;
    const oldestQueued = queueResult.data;
    const deadLetters = deadLetterResult.count;
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
      heartbeat.last_completed_at
        ? Math.floor((Date.now() - new Date(heartbeat.last_completed_at).getTime()) / 1000)
        : null,
    ]));
    const outboxWorkerAgeSeconds = workerAges.get("outbox") ?? null;
    const webhookWorkerAgeSeconds = workerAges.get("webhook") ?? null;
    const oldestQueuedAgeSeconds = oldestQueued?.created_at
      ? Math.floor((Date.now() - new Date(oldestQueued.created_at).getTime()) / 1000)
      : null;
    const messagingReady = sendMode !== "disabled" && (
      connection
      && ["test", "live"].includes(connection.state)
      && templatesReady
      && outboxWorkerAgeSeconds !== null
      && outboxWorkerAgeSeconds < 300
      && webhookWorkerAgeSeconds !== null
      && webhookWorkerAgeSeconds < 300
      && (oldestQueuedAgeSeconds === null || oldestQueuedAgeSeconds < 300)
      && (deadLetters ?? 0) === 0
    );
    return Response.json({
      status: messagingReady ? "ready" : "degraded",
      demoMode: false,
      website: "ready",
      database: "reachable",
      migrations: "0042-whatsapp-service-operations-present",
      messaging: {
        sendMode,
        connection: connection?.state ?? "missing",
        approvedTemplates,
        requiredTemplates: requiredTemplateKeys.length,
        outboxWorkerAgeSeconds,
        webhookWorkerAgeSeconds,
        oldestQueuedAgeSeconds,
        deadLetters: deadLetters ?? 0,
      },
      checkedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      demoMode: false,
      website: "ready",
      database: "unavailable",
      checkedAt,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

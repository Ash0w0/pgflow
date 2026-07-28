import { isDemoRuntime, getWhatsAppSendMode } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";

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
      { error: migrationError },
      { data: connection },
      { count: approvedTemplates },
      { data: heartbeat },
      { data: oldestQueued },
      { count: deadLetters },
    ] = await Promise.all([
      admin.from("whatsapp_outbox_jobs").select("id", { head: true, count: "exact" }).limit(1),
      admin.from("whatsapp_connections").select("state,last_verified_at").limit(1).maybeSingle(),
      admin.from("whatsapp_templates").select("*", { head: true, count: "exact" }).eq("approval_state", "approved"),
      admin.from("whatsapp_worker_heartbeats").select("last_completed_at,last_result")
        .eq("worker", "outbox").maybeSingle(),
      admin.from("whatsapp_outbox_jobs").select("created_at").in("state", ["queued", "retry_wait"])
        .order("created_at").limit(1).maybeSingle(),
      admin.from("whatsapp_outbox_jobs").select("*", { head: true, count: "exact" }).eq("state", "dead_letter"),
    ]);
    if (migrationError) throw migrationError;
    const sendMode = getWhatsAppSendMode();
    const workerAgeSeconds = heartbeat?.last_completed_at
      ? Math.floor((Date.now() - new Date(heartbeat.last_completed_at).getTime()) / 1000)
      : null;
    const oldestQueuedAgeSeconds = oldestQueued?.created_at
      ? Math.floor((Date.now() - new Date(oldestQueued.created_at).getTime()) / 1000)
      : null;
    const messagingReady = sendMode === "disabled" || (
      connection
      && ["test", "live"].includes(connection.state)
      && (approvedTemplates ?? 0) > 0
      && workerAgeSeconds !== null
      && workerAgeSeconds < 300
      && (deadLetters ?? 0) === 0
    );
    return Response.json({
      status: messagingReady ? "ready" : "degraded",
      demoMode: false,
      website: "ready",
      database: "reachable",
      migrations: "0037-whatsapp-worker-cron-present",
      messaging: {
        sendMode,
        connection: connection?.state ?? "missing",
        approvedTemplates: approvedTemplates ?? 0,
        workerAgeSeconds,
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

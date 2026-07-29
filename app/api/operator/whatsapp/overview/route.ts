import { requireOperator } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const results = await Promise.all([
    admin.from("whatsapp_connections").select("id,label,state,graph_version,last_template_sync_at,last_verified_at"),
    admin.from("whatsapp_templates").select("purpose,meta_name,language_code,approval_state,quality_state,last_synced_at")
      .order("purpose").order("language_code"),
    admin.from("whatsapp_conversations").select("*", { count: "exact", head: true })
      .in("state", ["awaiting_pg", "operator_review"]),
    admin.from("whatsapp_outbox_jobs").select("id,state,attempts,created_at,last_error_code")
      .in("state", ["queued", "retry_wait", "leased"]).order("created_at").limit(50),
    admin.from("whatsapp_outbox_jobs").select("id,message_id,attempts,created_at,last_error_code")
      .eq("state", "dead_letter").order("created_at", { ascending: false }).limit(50),
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
    { data: backlog },
    { data: deadLetters },
    { data: heartbeats },
  ] = results;
  return Response.json({
    connections: connections ?? [],
    templates: templates ?? [],
    unresolved: unresolved ?? 0,
    backlog: backlog ?? [],
    deadLetters: deadLetters ?? [],
    heartbeats: heartbeats ?? [],
  }, { headers: { "cache-control": "no-store" } });
}

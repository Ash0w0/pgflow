import { requireOperatorActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const operatorId = await requireOperatorActor(request);
  if (!operatorId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId || !isUuid(body.jobId)) return Response.json({ error: "A valid job is required." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data: job } = await admin.from("whatsapp_outbox_jobs")
    .select("id,organization_id,message_id,state").eq("id", body.jobId).maybeSingle();
  if (!job || job.state !== "dead_letter") return Response.json({ error: "Only dead-letter jobs can be replayed." }, { status: 409 });
  const { data: message } = await admin.from("whatsapp_messages")
    .select("provider_wamid,state").eq("id", job.message_id).maybeSingle();
  if (!message || message.provider_wamid || message.state === "delivery_uncertain") {
    return Response.json({ error: "This delivery is not safe to replay automatically." }, { status: 409 });
  }
  const now = new Date().toISOString();
  await admin.from("whatsapp_outbox_jobs").update({
    state: "queued", available_at: now, attempts: 0, last_error_code: null,
    last_error_summary: null, updated_at: now,
  }).eq("id", job.id).eq("state", "dead_letter");
  await admin.from("whatsapp_messages").update({
    state: "queued", error_code: null, updated_at: now,
  }).eq("id", job.message_id);
  await admin.from("audit_events").insert({
    organization_id: job.organization_id,
    actor_id: operatorId,
    action: "whatsapp.dead_letter_replayed",
    entity_type: "whatsapp_outbox_job",
    entity_id: job.id,
    after_data: { safeReplay: true, messageId: job.message_id },
  });
  return Response.json({ replayed: true, jobId: job.id });
}

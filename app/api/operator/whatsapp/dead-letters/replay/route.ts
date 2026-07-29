import { requireOperatorActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const operatorId = await requireOperatorActor(request);
  if (!operatorId) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId || !isUuid(body.jobId)) return Response.json({ error: "A valid job is required." }, { status: 400 });
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("replay_whatsapp_dead_letter", {
    p_job_id: body.jobId,
    p_operator_id: operatorId,
  });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (!data) return Response.json({ error: "Only dead-letter jobs can be replayed." }, { status: 409 });
  return Response.json({ replayed: true, jobId: body.jobId });
}

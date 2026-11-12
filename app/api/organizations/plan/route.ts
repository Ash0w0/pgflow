import { jsonError, requireOperatorActor } from "@/lib/http";
import { verifyOperatorPassword } from "@/lib/operator-reauth";
import { isUuid } from "@/lib/owner-invitations";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ACTIONS = new Set(["mark_paid", "extend_trial", "end_access"]);
const NO_STORE = { "cache-control": "no-store" };

/** End of the chosen India-local calendar day, so "paid until 10 Dec" includes 10 Dec. */
function endOfIndiaDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T23:59:59.999+05:30`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export async function POST(request: Request) {
  if (isDemoRuntime()) return jsonError("Plan changes are unavailable in the fictional demo.", 404);

  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("Platform operator authorization is required.", 403);

  const text = await request.text().catch(() => "");
  if (text.length > 2048) return jsonError("The plan request is too large.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    body = null;
  }
  if (!body) return jsonError("A JSON object is required.");

  const allowed = new Set(["organizationId", "action", "until", "note", "operatorPassword"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return jsonError("The plan request contains an unsupported field.");

  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  const note = typeof body.note === "string" ? body.note : "";
  if (!isUuid(organizationId)) return jsonError("A valid PG is required.");
  if (!ACTIONS.has(action)) return jsonError("Choose mark paid, extend trial, or end access.");
  if (note.length > 300) return jsonError("Keep the note under 300 characters.");

  let until: string | null = null;
  if (action !== "end_access") {
    until = typeof body.until === "string" ? endOfIndiaDay(body.until) : null;
    if (!until) return jsonError("Choose a valid date.");
  }

  const operatorPassword = typeof body.operatorPassword === "string" ? body.operatorPassword : "";
  if (!await verifyOperatorPassword(operatorUserId, operatorPassword)) {
    return jsonError("Your operator password is incorrect. The plan was not changed.", 401);
  }

  const { data, error } = await getSupabaseAdmin().rpc("set_organization_plan", {
    p_operator_user_id: operatorUserId,
    p_organization_id: organizationId,
    p_action: action,
    p_until: until,
    p_note: note,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 503;
    return jsonError(status === 503 ? "The plan could not be changed. Try again." : error.message, status);
  }

  return Response.json({ updated: true, plan: data }, { headers: NO_STORE });
}

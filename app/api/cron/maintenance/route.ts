import { authorizeCronRequest } from "../../../../lib/cron-auth.ts";
import { logEvent } from "../../../../lib/log.ts";

/** Daily housekeeping: deletes expired operational rows so tables stay small. */
export async function GET(request: Request) {
  const unauthorized = authorizeCronRequest(request);
  if (unauthorized) return unauthorized;
  if (process.env.PGFLOW_RUNTIME === "demo") return Response.json({ ok: true, demo: true });

  try {
    const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
    const { data, error } = await getSupabaseAdmin().rpc("prune_expired_operational_data");
    if (error) throw new Error(error.message);
    logEvent("info", "cron.maintenance.completed", { pruned: data });
    return Response.json({ ok: true, pruned: data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    logEvent("error", "cron.maintenance.failed", { error });
    return Response.json({ error: "Maintenance could not be completed." }, { status: 503 });
  }
}

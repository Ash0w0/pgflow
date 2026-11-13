import { isDemoRuntime } from "@/lib/runtime";
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
    if (!readPublicSupabaseConfig()) throw new Error("Missing configuration");
    const { error } = await getSupabaseAdmin().from("platform_operators").select("auth_user_id").limit(1);
    if (error) throw error;
    // A table from a recent migration must exist, or the deployed code is ahead of the database.
    const outbox = await getSupabaseAdmin().from("whatsapp_outbox").select("id").limit(1);
    const schemaCurrent = !outbox.error;

    return Response.json({
      status: schemaCurrent ? "ready" : "degraded",
      demoMode: false,
      database: "reachable",
      migrations: schemaCurrent ? "current" : "behind-deployed-code",
      checkedAt,
    }, { status: schemaCurrent ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      demoMode: false,
      database: "unavailable",
      checkedAt,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

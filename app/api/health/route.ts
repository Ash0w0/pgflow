import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";

/** The newest file in supabase/migrations. A unit test keeps this in step. */
export const EXPECTED_SCHEMA_VERSION = "0043";

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
    // The database must have every update the deployed code expects. An older
    // database (or one missing the version probe itself) reports "behind".
    const version = await getSupabaseAdmin().rpc("pgflow_schema_version");
    const appliedVersion = typeof version.data === "string" ? version.data : "";
    const schemaCurrent = !version.error && appliedVersion >= EXPECTED_SCHEMA_VERSION;

    return Response.json({
      status: schemaCurrent ? "ready" : "degraded",
      demoMode: false,
      database: "reachable",
      migrations: schemaCurrent ? "current" : "behind-deployed-code",
      schema: { applied: appliedVersion || "unknown", expected: EXPECTED_SCHEMA_VERSION },
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

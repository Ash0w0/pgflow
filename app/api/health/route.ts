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

    return Response.json({
      status: "ready",
      demoMode: false,
      database: "reachable",
      migrations: "production-foundation-present",
      checkedAt,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      demoMode: false,
      database: "unavailable",
      checkedAt,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

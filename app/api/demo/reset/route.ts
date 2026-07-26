import { requireOperator, jsonError } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";

export async function POST(request: Request) {
  if (!isDemoRuntime()) return jsonError("Not found.", 404);
  if (!await requireOperator(request)) return jsonError("Platform operator authorization is required.", 403);
  const { createCanonicalDemoSeed } = await import("@/demo/seed");
  const seed = createCanonicalDemoSeed();
  return Response.json({
    reset: false,
    preview: true,
    organization: "PGFlow Sample",
    seedVersion: seed.seedVersion,
    canonicalCounts: { floors: seed.floors.length, rooms: seed.rooms.length, beds: seed.beds.length, tenants: seed.tenants.length },
    liveMessagingDisabled: true,
    realPaymentsDisabled: true,
    note: "Canonical seed generation is available, but database reset remains disabled until operator authentication and transactional persistence are connected.",
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

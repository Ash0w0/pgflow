import { requireOperator, jsonError } from "@/lib/http";
import { createCanonicalDemoSeed } from "@/lib/template";

export async function POST(request: Request) {
  if (!requireOperator(request)) return jsonError("Platform operator authorization is required.", 403);
  const seed = createCanonicalDemoSeed();
  return Response.json({
    reset: false,
    preview: true,
    organization: "Nivasa Demo House",
    seedVersion: seed.seedVersion,
    canonicalCounts: { floors: seed.floors.length, rooms: seed.rooms.length, beds: seed.beds.length, tenants: seed.tenants.length },
    liveMessagingDisabled: true,
    realPaymentsDisabled: true,
    note: "Canonical seed generation is available, but database reset remains disabled until operator authentication and transactional persistence are connected.",
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

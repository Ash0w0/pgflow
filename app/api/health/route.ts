export function GET() {
  return Response.json({
    status: "prototype",
    demoMode: true,
    livePayments: false,
    liveWhatsApp: false,
    persistence: "schema-ready-not-connected",
    checkedAt: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}

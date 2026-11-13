import { authorizeCronRequest } from "../../../../lib/cron-auth.ts";
import { sendWhatsAppTemplate } from "../../../../lib/whatsapp/client.ts";
import { buildDailyOwnerDigestPayload, getDailyOwnerDigestPreview } from "../../../../lib/whatsapp/templates.ts";

export async function GET(request: Request) {
  try {
    const unauthorized = authorizeCronRequest(request);
    if (unauthorized) return unauthorized;
    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    const todayIso = new Date().toISOString().split("T")[0];

    if (isDemo) {
      const digestParams = {
        ownerPhone: "919876543210",
        ownerName: "Rohan Sharma",
        dateStr: todayIso,
        todayCollections: 45000,
        collectionsCount: 4,
        pendingAmount: 24000,
        pendingCount: 3,
        occupiedBeds: 48,
        vacantBeds: 2,
        openTickets: 1,
      };

      const payload = buildDailyOwnerDigestPayload(digestParams);
      const previewText = getDailyOwnerDigestPreview(digestParams);
      const dispatch = await sendWhatsAppTemplate(payload);

      return Response.json({
        ok: true,
        digest: digestParams,
        previewText,
        wamid: dispatch.wamid,
        demo: dispatch.demo,
        message: "8:00 PM Daily Owner Digest dispatched in demo mode.",
      });
    }

    // The owner digest is not built from live data yet, so production never sends it.
    return Response.json(
      { error: "The daily owner digest is not available yet." },
      { status: 501 },
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

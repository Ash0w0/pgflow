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

    const { getSupabaseAdmin } = await import("../../../../lib/supabase/admin.ts");
    const admin = getSupabaseAdmin();
    // Query active memberships for PG owners
    const { data: owners, error: ownersError } = await admin
      .from("memberships")
      .select("*, auth_user_id, organizations(*)")
      .eq("role", "owner")
      .eq("state", "active");

    if (ownersError || !owners) {
      return Response.json(
        { error: ownersError?.message || "No active PG owners found for daily digest." },
        { status: 500 }
      );
    }

    const results = [];

    for (const owner of owners) {
      const orgId = owner.organization_id;
      const ownerPhone = owner.phone || "919876543210";
      const ownerName = owner.full_name || "PG Owner";

      const digestParams = {
        ownerPhone,
        ownerName,
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
      const dispatch = await sendWhatsAppTemplate(payload);

      if (dispatch.ok) {
        await admin.rpc("log_whatsapp_message", {
          p_organization_id: orgId,
          p_recipient_phone: ownerPhone,
          p_direction: "outbound",
          p_template_name: payload.templateName,
          p_wamid: dispatch.wamid || null,
          p_delivery_status: "sent",
          p_idempotency_key: `digest:${orgId}:${todayIso}`,
        });
      }

      results.push({
        owner: ownerName,
        phone: ownerPhone,
        ok: dispatch.ok,
      });
    }

    return Response.json({
      ok: true,
      processedCount: results.length,
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: errorMsg }, { status: 500 });
  }
}

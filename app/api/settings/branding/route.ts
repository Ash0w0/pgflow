import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function PUT(request: Request) {
  if (!isTrustedMutationRequest(request)) {
    return jsonError("Cross-origin branding changes are not allowed.", 403);
  }

  const actor = await requireActor(request, ["owner"]);
  if (!actor) {
    return jsonError("Owner authorization required.", 401);
  }

  try {
    const body = (await request.json()) as { primaryColor?: string; accentColor?: string };
    const primaryColor = typeof body.primaryColor === "string" ? body.primaryColor.trim() : "";
    const accentColor = typeof body.accentColor === "string" ? body.accentColor.trim() : "";

    if (!primaryColor || !accentColor) {
      return jsonError("Both primary and accent colors are required.", 400);
    }

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";
    if (!isDemo && actor.organizationId) {
      const admin = getSupabaseAdmin();
      // Update brand_themes or organization settings if table exists
      await admin
        .from("brand_themes")
        .upsert(
          {
            organization_id: actor.organizationId,
            primary_color: primaryColor,
            accent_color: accentColor,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id" }
        )
        .catch(() => null);
    }

    return NextResponse.json({
      updated: true,
      primaryColor,
      accentColor,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error saving branding.";
    return jsonError(msg, 500);
  }
}

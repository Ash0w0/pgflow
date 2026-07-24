import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, isBrandColor } from "@/lib/branding";
import { jsonError, requireActor } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 512;

export async function PUT(request: Request) {
  // requireActor already rejects cross-origin mutations through isTrustedMutationRequest.
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return jsonError("A JSON request is required.", 415);
  }

  const actor = await requireActor(request, ["owner"]);
  if (!actor) return jsonError("Owner authorization required.", 401);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return jsonError("The branding request is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonError("The branding request is invalid.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("The branding request is invalid.");
  }

  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !isBrandColor(record.primaryColor) || !isBrandColor(record.accentColor)) {
    return jsonError("Enter both the primary and accent colors as six-digit hex values, for example #123d32.");
  }

  const primaryColor = record.primaryColor.trim().toLowerCase();
  const accentColor = record.accentColor.trim().toLowerCase();

  // The demo workspace is shared and intentionally not writable.
  if (isDemoRuntime()) {
    return Response.json(
      { updated: true, persisted: false, theme: { primaryColor, accentColor } },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data, error } = await getSupabaseAdmin().rpc("update_brand_theme", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_primary_color: primaryColor,
    p_accent_color: accentColor,
  });

  if (error) {
    return jsonError(
      error.code === "42501" ? "Owner access is required." : error.message ?? "The color scheme could not be saved.",
      error.code === "42501" ? 403 : 400,
    );
  }

  const theme = (data ?? {}) as { primaryColor?: string; accentColor?: string };
  return Response.json(
    {
      updated: true,
      persisted: true,
      theme: {
        primaryColor: theme.primaryColor ?? DEFAULT_BRAND_PRIMARY,
        accentColor: theme.accentColor ?? DEFAULT_BRAND_ACCENT,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

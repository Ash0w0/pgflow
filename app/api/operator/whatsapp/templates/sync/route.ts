import { requireOperator } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";

type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  category?: string;
  quality_score?: { score?: string };
  components?: unknown[];
};

export async function POST(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const config = getWhatsAppConfig();
  if (config.runtime !== "production" || !config.accessToken || !config.wabaId) {
    return Response.json({ error: "Live Meta configuration is unavailable." }, { status: 409 });
  }
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${config.wabaId}/message_templates`);
  url.searchParams.set("fields", "name,status,quality_score,language,category,components");
  url.searchParams.set("limit", "100");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${config.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { data?: MetaTemplate[]; error?: { message?: string } };
  if (!response.ok) return Response.json({ error: payload.error?.message ?? "Meta template sync failed." }, { status: 502 });

  const admin = getSupabaseAdmin();
  const phoneNumberId = config.phoneNumberId;
  const { data: connection } = await admin.from("whatsapp_connections")
    .select("id").eq("phone_number_id", phoneNumberId).maybeSingle();
  if (!connection) return Response.json({ error: "WhatsApp connection is not registered." }, { status: 409 });
  const now = new Date().toISOString();
  let updated = 0;
  for (const template of payload.data ?? []) {
    const { error } = await admin.from("whatsapp_templates").update({
      approval_state: template.status.toLowerCase(),
      quality_state: template.quality_score?.score?.toLowerCase() ?? "unknown",
      category: template.category ?? "UTILITY",
      last_sync_result: { components: template.components ?? [] },
      last_synced_at: now,
      updated_at: now,
    }).eq("connection_id", connection.id)
      .eq("meta_name", template.name)
      .eq("language_code", template.language.startsWith("hi") ? "hi" : "en");
    if (!error) updated += 1;
  }
  await admin.from("whatsapp_connections").update({ last_template_sync_at: now, updated_at: now })
    .eq("id", connection.id);
  return Response.json({ synced: payload.data?.length ?? 0, updated });
}

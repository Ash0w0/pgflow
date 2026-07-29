import { requireOperator } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import {
  metaParameterSchema,
  templateSchemasMatch,
  type TemplateParameterSchema,
} from "@/lib/whatsapp/template-schema";

type MetaTemplate = {
  name: string;
  language: string;
  status: string;
  category?: string;
  quality_score?: { score?: string };
  components?: unknown[];
};

function approvalState(status: string, schemaMatches: boolean) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "approved") return schemaMatches ? "approved" : "disabled";
  if (["pending", "paused", "disabled", "rejected"].includes(normalized)) return normalized;
  return "unknown";
}

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
    const language = template.language.startsWith("hi")
      ? "hi" : template.language.startsWith("en") ? "en" : null;
    if (!language) continue;
    const { data: registry, error: registryError } = await admin
      .from("whatsapp_templates")
      .select("id,parameter_schema")
      .eq("connection_id", connection.id)
      .eq("meta_name", template.name)
      .eq("language_code", language)
      .maybeSingle();
    if (registryError) return Response.json({ error: registryError.message }, { status: 409 });
    if (!registry) continue;
    const actualSchema = metaParameterSchema(template.components ?? []);
    const schemaMatches = templateSchemasMatch(
      registry.parameter_schema as TemplateParameterSchema,
      actualSchema,
    );
    const { error } = await admin.from("whatsapp_templates").update({
      approval_state: approvalState(template.status, schemaMatches),
      quality_state: template.quality_score?.score?.toLowerCase() ?? "unknown",
      category: template.category ?? "UTILITY",
      last_sync_result: {
        components: template.components ?? [],
        actualSchema,
        schemaMatches,
      },
      last_synced_at: now,
      updated_at: now,
    }).eq("connection_id", connection.id)
      .eq("meta_name", template.name)
      .eq("language_code", language);
    if (error) return Response.json({ error: error.message }, { status: 409 });
    updated += 1;
  }
  const { error: connectionError } = await admin.from("whatsapp_connections")
    .update({ last_template_sync_at: now, updated_at: now })
    .eq("id", connection.id);
  if (connectionError) return Response.json({ error: connectionError.message }, { status: 409 });
  return Response.json({ synced: payload.data?.length ?? 0, updated });
}

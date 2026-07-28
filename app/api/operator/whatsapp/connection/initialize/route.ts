import { requireOperator } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";

const purposes = [
  "welcome_consent",
  "rent_reminder",
  "overdue_reminder",
  "proof_received",
  "proof_rejected",
  "payment_review",
  "payment_action_confirmation",
  "receipt",
  "maintenance_created",
  "maintenance_update",
  "move_out_request",
  "move_out_update",
  "important_owner_alert",
  "weekly_report",
] as const;

export async function POST(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const config = getWhatsAppConfig();
  if (
    config.runtime !== "production" || !config.phoneNumberId || !config.wabaId
    || config.sendMode === "disabled"
  ) return Response.json({ error: "Enable a test or live Meta configuration first." }, { status: 409 });
  const admin = getSupabaseAdmin();
  const { data: connection, error } = await admin.from("whatsapp_connections").upsert({
    label: `PGFlow ${config.environment}`,
    waba_id: config.wabaId,
    phone_number_id: config.phoneNumberId,
    graph_version: config.graphVersion,
    state: config.sendMode === "live" ? "live" : "test",
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_number_id" }).select("id").single();
  if (error) return Response.json({ error: "Connection registry could not be initialized." }, { status: 409 });
  const rows = purposes.flatMap((purpose) => (["en", "hi"] as const).map((language) => ({
    connection_id: connection.id,
    purpose,
    meta_name: `pgflow_${purpose}_${language}`,
    language_code: language,
    category: "UTILITY",
    parameter_schema: [],
    approval_state: "unknown",
  })));
  const { error: templateError } = await admin.from("whatsapp_templates")
    .upsert(rows, { onConflict: "connection_id,purpose,language_code", ignoreDuplicates: true });
  if (templateError) return Response.json({ error: "Template registry could not be initialized." }, { status: 409 });
  return Response.json({ connectionId: connection.id, templatesRegistered: rows.length }, { status: 201 });
}

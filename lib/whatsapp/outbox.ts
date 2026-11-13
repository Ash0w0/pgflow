import "server-only";

import { createPaymentLinkSecret } from "../payment-links";
import { logEvent } from "../log";
import { loadReceipt } from "../receipt-data";
import { getSupabaseAdmin } from "../supabase/admin";
import { isWhatsAppConfigured, normalizeWhatsAppPhone, sendWhatsAppTemplate } from "./client";
import { buildPaymentReceiptPayload, buildRentDueReminderPayload } from "./templates";

const MAX_ATTEMPTS = 5;
const PAYMENT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_LINK_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type OutboxRow = {
  id: string;
  organization_id: string;
  property_id: string;
  kind: "rent_reminder" | "payment_receipt";
  entity_id: string;
  tenant_id: string;
  stage: string | null;
  idempotency_key: string;
  attempts: number;
};

type Outcome =
  | { state: "sent"; wamid?: string; recipient: string; templateName: string; language: "en" | "hi" }
  | { state: "skipped" | "failed"; error: string }
  | { state: "retry"; error: string };

export type OutboxRunResult = { configured: boolean; claimed: number; sent: number; skipped: number; failed: number; retrying: number };

/** Public base URL of a PG: its verified custom domain, else its platform subdomain. */
async function pgBaseUrl(organizationId: string) {
  const { data } = await getSupabaseAdmin()
    .from("domain_mappings")
    .select("hostname,kind")
    .eq("organization_id", organizationId)
    .eq("state", "verified");
  const mapping = (data ?? []).find((row) => row.kind === "custom") ?? (data ?? []).find((row) => row.kind === "platform_subdomain");
  if (!mapping) return null;
  const local = mapping.hostname === "localhost" || mapping.hostname.endsWith(".localhost");
  return local ? `http://${mapping.hostname}:${process.env.PORT ?? "3000"}` : `https://${mapping.hostname}`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${value}T00:00:00+05:30`));
}

function periodLabel(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period === "opening" ? "opening balance" : period.startsWith("correction-") ? "correction" : period;
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

async function pgSettings(organizationId: string, propertyId: string) {
  const admin = getSupabaseAdmin();
  const [property, brand] = await Promise.all([
    admin.from("properties").select("name,whatsapp_language,whatsapp_auto_reminders,whatsapp_auto_receipts").eq("organization_id", organizationId).eq("id", propertyId).maybeSingle(),
    admin.from("brand_themes").select("app_name").eq("organization_id", organizationId).maybeSingle(),
  ]);
  if (property.error || !property.data) return null;
  return {
    pgName: brand.data?.app_name || property.data.name,
    language: (property.data.whatsapp_language === "hi" ? "hi" : "en") as "en" | "hi",
    autoReminders: property.data.whatsapp_auto_reminders === true,
    autoReceipts: property.data.whatsapp_auto_receipts === true,
  };
}

async function buildReminder(row: OutboxRow): Promise<Outcome | { payload: ReturnType<typeof buildRentDueReminderPayload>; language: "en" | "hi" }> {
  const admin = getSupabaseAdmin();
  const settings = await pgSettings(row.organization_id, row.property_id);
  if (!settings) return { state: "retry", error: "PG settings could not be loaded." };
  if (!settings.autoReminders) return { state: "skipped", error: "Automatic reminders were turned off." };

  const [{ data: invoice }, { data: tenant }] = await Promise.all([
    admin.from("invoices").select("id,period,due_date,total_amount,paid_amount,state").eq("organization_id", row.organization_id).eq("id", row.entity_id).maybeSingle(),
    admin.from("tenant_profiles").select("full_name,phone,state").eq("organization_id", row.organization_id).eq("id", row.tenant_id).maybeSingle(),
  ]);
  if (!invoice || !tenant) return { state: "skipped", error: "The invoice or resident no longer exists." };
  const balance = Number(invoice.total_amount) - Number(invoice.paid_amount);
  if (!["issued", "partially_paid", "overdue"].includes(invoice.state) || balance <= 0) return { state: "skipped", error: "The invoice is already paid." };
  if (!["active", "notice"].includes(tenant.state)) return { state: "skipped", error: "The resident has moved out." };

  const baseUrl = await pgBaseUrl(row.organization_id);
  if (!baseUrl) return { state: "retry", error: "The PG has no verified web address." };

  const { token, tokenHash } = createPaymentLinkSecret();
  const { error } = await admin.rpc("create_system_payment_request", {
    p_organization_id: row.organization_id,
    p_invoice_id: invoice.id,
    p_token_hash: tokenHash,
    p_expires_at: new Date(Date.now() + PAYMENT_LINK_TTL_MS).toISOString(),
  });
  if (error) {
    if (error.code === "P0001" || error.code === "22023") return { state: "skipped", error: error.message ?? "No payment link could be created." };
    return { state: "retry", error: "The payment link could not be created." };
  }
  const paymentUrl = new URL(`/pay/${invoice.id}`, baseUrl);
  paymentUrl.searchParams.set("token", token);

  return {
    language: settings.language,
    payload: buildRentDueReminderPayload({
      recipientPhone: tenant.phone,
      residentName: tenant.full_name,
      amount: balance,
      billingPeriod: periodLabel(invoice.period),
      pgName: settings.pgName,
      dueDate: shortDate(invoice.due_date),
      paymentUrl: paymentUrl.toString(),
      language: settings.language,
    }),
  };
}

async function buildReceipt(row: OutboxRow): Promise<Outcome | { payload: ReturnType<typeof buildPaymentReceiptPayload>; language: "en" | "hi" }> {
  const settings = await pgSettings(row.organization_id, row.property_id);
  if (!settings) return { state: "retry", error: "PG settings could not be loaded." };
  if (!settings.autoReceipts) return { state: "skipped", error: "Automatic receipts were turned off." };

  let receipt;
  try {
    receipt = await loadReceipt(row.organization_id, row.entity_id);
  } catch {
    return { state: "retry", error: "The receipt could not be loaded." };
  }
  if (!receipt) return { state: "skipped", error: "The payment is no longer approved." };

  const baseUrl = await pgBaseUrl(row.organization_id);
  if (!baseUrl) return { state: "retry", error: "The PG has no verified web address." };

  const { token, tokenHash } = createPaymentLinkSecret();
  const { error } = await getSupabaseAdmin().from("receipt_links").insert({
    organization_id: row.organization_id,
    payment_id: row.entity_id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + RECEIPT_LINK_TTL_MS).toISOString(),
  });
  if (error) return { state: "retry", error: "The receipt link could not be created." };

  return {
    language: settings.language,
    payload: buildPaymentReceiptPayload({
      recipientPhone: receipt.residentPhone,
      residentName: receipt.residentName,
      amount: receipt.data.amountPaid,
      billingPeriod: receipt.periodLabel,
      receiptNumber: receipt.data.receiptNumber,
      receiptUrl: new URL(`/receipt/${token}`, baseUrl).toString(),
      pgName: receipt.data.pgName,
      language: settings.language,
    }),
  };
}

async function deliver(row: OutboxRow): Promise<Outcome> {
  const built = row.kind === "rent_reminder" ? await buildReminder(row) : await buildReceipt(row);
  if ("state" in built) return built;

  try {
    normalizeWhatsAppPhone(built.payload.recipientPhone);
  } catch {
    return { state: "failed", error: "The resident's phone number is not a valid Indian mobile number." };
  }

  const result = await sendWhatsAppTemplate(built.payload);
  if (result.ok) {
    return { state: "sent", wamid: result.wamid, recipient: built.payload.recipientPhone, templateName: built.payload.templateName, language: built.language };
  }
  return { state: "retry", error: (result.error ?? "Meta did not accept the message.").slice(0, 500) };
}

/**
 * Delivers queued WhatsApp messages. Does nothing (and claims nothing) until
 * the PGFlow WhatsApp number is connected, so queued messages wait safely.
 */
export async function processWhatsAppOutbox(options: { organizationId?: string; limit?: number } = {}): Promise<OutboxRunResult> {
  const result: OutboxRunResult = { configured: isWhatsAppConfigured(), claimed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0 };
  if (!result.configured) return result;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("claim_whatsapp_outbox", {
    p_limit: options.limit ?? 25,
    p_organization_id: options.organizationId ?? null,
  });
  if (error) throw new Error("The WhatsApp queue could not be read.");
  const rows = (data ?? []) as OutboxRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    let outcome: Outcome;
    try {
      outcome = await deliver(row);
    } catch {
      outcome = { state: "retry", error: "Unexpected error while sending." };
    }

    const now = new Date();
    if (outcome.state === "sent") {
      result.sent += 1;
      await admin.from("whatsapp_outbox").update({ state: "sent", wamid: outcome.wamid ?? null, sent_at: now.toISOString(), last_error: null, updated_at: now.toISOString() }).eq("id", row.id);
      await admin.rpc("log_whatsapp_message", {
        p_organization_id: row.organization_id,
        p_recipient_phone: outcome.recipient,
        p_direction: "outbound",
        p_template_name: outcome.templateName,
        p_language_code: outcome.language,
        p_wamid: outcome.wamid ?? null,
        p_delivery_status: "sent",
        p_idempotency_key: row.idempotency_key,
        p_payload: { kind: row.kind, stage: row.stage, outboxId: row.id },
        p_resident_id: row.tenant_id,
      });
    } else if (outcome.state === "retry" && row.attempts < MAX_ATTEMPTS) {
      result.retrying += 1;
      const delayMinutes = 10 * row.attempts * row.attempts;
      await admin.from("whatsapp_outbox").update({
        state: "pending",
        last_error: outcome.error,
        next_attempt_at: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
        updated_at: now.toISOString(),
      }).eq("id", row.id);
    } else {
      const finalState = outcome.state === "skipped" ? "skipped" : "failed";
      if (finalState === "skipped") result.skipped += 1; else {
        result.failed += 1;
        logEvent("warn", "whatsapp.outbox.delivery_failed", { outboxId: row.id, organizationId: row.organization_id, kind: row.kind, attempts: row.attempts, reason: outcome.error });
      }
      await admin.from("whatsapp_outbox").update({ state: finalState, last_error: outcome.error, updated_at: now.toISOString() }).eq("id", row.id);
    }
  }
  return result;
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
  type SendWhatsAppTemplateOptions,
  type WhatsAppSendResult,
} from "./client";

type OutboxJob = {
  id: string;
  organization_id: string;
  message_id: string;
  attempts: number;
  max_attempts: number;
  expires_at: string | null;
};

type MessageRecord = {
  id: string;
  organization_id: string;
  connection_id: string;
  contact_id: string;
  kind: string;
  language_code: "en" | "hi";
  intent: Record<string, string>;
};

function tokenPair() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

async function publicOrganizationUrl(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data: mapping } = await admin
    .from("domain_mappings")
    .select("hostname")
    .eq("organization_id", organizationId)
    .eq("state", "verified")
    .order("kind", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!mapping?.hostname) throw new Error("Organization hostname is not ready.");
  return `https://${mapping.hostname}`;
}

async function approvedTemplate(message: MessageRecord) {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_templates")
    .select("id,meta_name,parameter_schema")
    .eq("connection_id", message.connection_id)
    .eq("purpose", message.kind)
    .eq("language_code", message.language_code)
    .eq("approval_state", "approved")
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Approved ${message.kind}/${message.language_code} template is unavailable.`);
  }
  return data;
}

async function contactForMessage(message: MessageRecord) {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_contacts")
    .select("phone_e164,display_name,consent_state,essential_enabled,reminders_enabled,weekly_report_enabled")
    .eq("id", message.contact_id)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (error || !data) throw new Error("WhatsApp contact is unavailable.");
  return data;
}

function bodyParameters(values: Array<string | number>) {
  return {
    type: "body" as const,
    parameters: values.map((value) => ({ type: "text" as const, text: String(value) })),
  };
}

function urlButton(url: string) {
  return {
    type: "button" as const,
    sub_type: "url" as const,
    index: "0",
    parameters: [{ type: "text" as const, text: url }],
  };
}

function quickReply(index: string, payload: string) {
  return {
    type: "button" as const,
    sub_type: "quick_reply" as const,
    index,
    parameters: [{ type: "payload" as const, payload }],
  };
}

async function renderRentReminder(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const admin = getSupabaseAdmin();
  const invoiceId = message.intent.invoiceId;
  const { data: invoice } = await admin
    .from("invoices")
    .select("id,property_id,tenant_id,period,due_date,total_amount,paid_amount,state")
    .eq("id", invoiceId)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (!invoice || !["issued", "partially_paid", "overdue"].includes(invoice.state)) {
    throw new Error("Invoice is no longer payable.");
  }
  const [{ data: tenant }, { data: property }, { data: owner }] = await Promise.all([
    admin.from("tenant_profiles").select("full_name").eq("id", invoice.tenant_id).maybeSingle(),
    admin.from("properties").select("name").eq("id", invoice.property_id).maybeSingle(),
    admin.from("memberships").select("auth_user_id")
      .eq("organization_id", message.organization_id)
      .eq("property_id", invoice.property_id)
      .eq("role", "owner").eq("state", "active").limit(1).maybeSingle(),
  ]);
  if (!tenant || !property || !owner) throw new Error("Invoice routing data is incomplete.");

  const { token, hash } = tokenPair();
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error } = await admin.rpc("create_invoice_payment_request", {
    p_actor_user_id: owner.auth_user_id,
    p_organization_id: message.organization_id,
    p_property_id: invoice.property_id,
    p_invoice_id: invoice.id,
    p_token_hash: hash,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Payment link creation failed: ${error.message}`);
  const url = `${await publicOrganizationUrl(message.organization_id)}/pay/${invoice.id}?token=${encodeURIComponent(token)}`;
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([
        tenant.full_name,
        (invoice.total_amount - invoice.paid_amount).toLocaleString("en-IN"),
        invoice.period,
        property.name,
        invoice.due_date,
      ]),
      urlButton(url),
    ],
  };
}

async function renderReceipt(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const admin = getSupabaseAdmin();
  const { data: receipt } = await admin
    .from("receipts")
    .select("id,tenant_id,invoice_id,number,amount")
    .eq("id", message.intent.receiptId)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (!receipt) throw new Error("Receipt is unavailable.");
  const [{ data: tenant }, { data: invoice }] = await Promise.all([
    admin.from("tenant_profiles").select("full_name").eq("id", receipt.tenant_id).maybeSingle(),
    admin.from("invoices").select("period").eq("id", receipt.invoice_id).maybeSingle(),
  ]);
  if (!tenant || !invoice) throw new Error("Receipt routing data is incomplete.");

  const { token, hash } = tokenPair();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const { error } = await admin.from("resident_receipt_links").upsert({
    organization_id: message.organization_id,
    receipt_id: receipt.id,
    tenant_id: receipt.tenant_id,
    token_hash: hash,
    expires_at: expiresAt,
    revoked_at: null,
  }, { onConflict: "organization_id,receipt_id" });
  if (error) throw new Error("Receipt link creation failed.");
  const url = `${await publicOrganizationUrl(message.organization_id)}/api/public/receipts/${receipt.id}?token=${encodeURIComponent(token)}`;
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([
        tenant.full_name,
        receipt.amount.toLocaleString("en-IN"),
        invoice.period,
        receipt.number,
      ]),
      urlButton(url),
    ],
  };
}

async function paymentSnapshot(message: MessageRecord) {
  const admin = getSupabaseAdmin();
  const { data: payment } = await admin.from("payments")
    .select("id,property_id,tenant_id,invoice_id,amount,reference,paid_at,state")
    .eq("organization_id", message.organization_id)
    .eq("id", message.intent.paymentId)
    .maybeSingle();
  if (!payment) throw new Error("Payment is unavailable.");
  const [{ data: tenant }, { data: occupancy }, { data: property }] = await Promise.all([
    admin.from("tenant_profiles").select("full_name").eq("id", payment.tenant_id).maybeSingle(),
    admin.from("occupancies").select("bed_id").eq("organization_id", message.organization_id)
      .eq("tenant_id", payment.tenant_id).in("state", ["active", "notice"]).limit(1).maybeSingle(),
    admin.from("properties").select("upi_id,upi_payee_name").eq("id", payment.property_id).maybeSingle(),
  ]);
  let room = "Unassigned";
  if (occupancy?.bed_id) {
    const { data: bed } = await admin.from("beds").select("room_id,label").eq("id", occupancy.bed_id).maybeSingle();
    if (bed) {
      const { data: roomRow } = await admin.from("rooms").select("code").eq("id", bed.room_id).maybeSingle();
      room = `${roomRow?.code ?? "Room"} / ${bed.label}`;
    }
  }
  return { payment, tenant, property, room };
}

async function renderPaymentReview(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { payment, tenant, property, room } = await paymentSnapshot(message);
  if (payment.state !== "pending_review") throw new Error("Payment is no longer pending.");
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([
        tenant?.full_name ?? "Resident",
        room,
        Number(payment.amount).toLocaleString("en-IN"),
        payment.reference ?? "No UTR",
        property?.upi_payee_name ?? "PG account",
        property?.upi_id ?? "Configured PG UPI",
      ]),
      quickReply("0", `review_approve:${payment.id}`),
      quickReply("1", `review_reject:${payment.id}`),
    ],
  };
}

async function renderPaymentRejection(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { payment, tenant } = await paymentSnapshot(message);
  if (payment.state !== "rejected") throw new Error("Payment is no longer rejected.");
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      tenant?.full_name ?? "Resident",
      Number(payment.amount).toLocaleString("en-IN"),
      message.intent.reason || "Payment evidence could not be verified",
    ])],
  };
}

async function renderPaymentConfirmation(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
) {
  const admin = getSupabaseAdmin();
  const { payment, tenant, room } = await paymentSnapshot(message);
  if (payment.state !== "pending_review") throw new Error("Payment is no longer pending.");
  const { data: contact } = await admin.from("whatsapp_contacts")
    .select("membership_id").eq("id", message.contact_id)
    .eq("organization_id", message.organization_id).maybeSingle();
  if (!contact?.membership_id) throw new Error("Owner membership is unavailable.");
  const decision = message.intent.decision === "reject" ? "reject" : "approve";
  const { token, hash } = tokenPair();
  const challengeId = crypto.randomUUID();
  const { error } = await admin.from("whatsapp_action_challenges").insert({
    id: challengeId,
    organization_id: message.organization_id,
    contact_id: message.contact_id,
    membership_id: contact.membership_id,
    action: decision === "approve" ? "payment_approve" : "payment_reject",
    entity_type: "payment",
    entity_id: payment.id,
    context_wamid: message.id,
    token_hash: hash,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Payment challenge creation failed: ${error.message}`);
  return {
    challengeId,
    options: {
      recipientPhone,
      templateName,
      languageCode: message.language_code,
      components: [
        bodyParameters([
          decision === "approve" ? "APPROVE" : "REJECT",
          tenant?.full_name ?? "Resident",
          room,
          Number(payment.amount).toLocaleString("en-IN"),
          payment.reference ?? "No UTR",
        ]),
        quickReply("0", `confirm_${decision}:${token}`),
      ],
    } satisfies SendWhatsAppTemplateOptions,
  };
}

async function renderWeeklyReport(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const admin = getSupabaseAdmin();
  const start = new Date(`${message.intent.weekStart}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const [
    { data: payments },
    { data: invoices },
    { count: occupied },
    { count: vacant },
    { count: pendingReviews },
    { count: openedMaintenance },
    { count: resolvedMaintenance },
    { data: contact },
  ] = await Promise.all([
    admin.from("payments").select("amount").eq("organization_id", message.organization_id)
      .eq("state", "approved").gte("approved_at", start.toISOString()).lt("approved_at", end.toISOString()),
    admin.from("invoices").select("total_amount,paid_amount,state").eq("organization_id", message.organization_id)
      .in("state", ["issued", "partially_paid", "overdue"]),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("state", "occupied"),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("state", "vacant"),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id).eq("state", "pending_review"),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("status", "resolved").gte("updated_at", start.toISOString()).lt("updated_at", end.toISOString()),
    admin.from("whatsapp_contacts").select("display_name").eq("id", message.contact_id).maybeSingle(),
  ]);
  const collected = (payments ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const outstanding = (invoices ?? []).reduce(
    (sum, row) => sum + Number(row.total_amount) - Number(row.paid_amount), 0,
  );
  const overdue = (invoices ?? []).filter((row) => row.state === "overdue").reduce(
    (sum, row) => sum + Number(row.total_amount) - Number(row.paid_amount), 0,
  );
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      contact?.display_name ?? "Owner",
      message.intent.weekStart,
      collected.toLocaleString("en-IN"),
      payments?.length ?? 0,
      outstanding.toLocaleString("en-IN"),
      overdue.toLocaleString("en-IN"),
      `${occupied ?? 0}/${(occupied ?? 0) + (vacant ?? 0)}`,
      pendingReviews ?? 0,
      `${openedMaintenance ?? 0}/${resolvedMaintenance ?? 0}`,
    ])],
  };
}

async function renderMessage(message: MessageRecord) {
  const contact = await contactForMessage(message);
  if (contact.consent_state !== "opted_in") {
    return { suppressed: "Contact has not opted in." } as const;
  }
  if (message.kind === "rent_reminder" && !contact.reminders_enabled) {
    return { suppressed: "Rent reminders are disabled." } as const;
  }
  if (message.kind === "weekly_report" && !contact.weekly_report_enabled) {
    return { suppressed: "Weekly reports are disabled." } as const;
  }
  if (message.kind === "session_reply") {
    const text = message.intent.text;
    if (!text || text.length > 1000) throw new Error("Session reply is invalid.");
    return { sessionText: text, recipientPhone: contact.phone_e164 } as const;
  }
  const template = await approvedTemplate(message);
  if (message.kind === "rent_reminder") {
    return { options: await renderRentReminder(message, contact.phone_e164, template.meta_name) } as const;
  }
  if (message.kind === "receipt") {
    return { options: await renderReceipt(message, contact.phone_e164, template.meta_name) } as const;
  }
  if (message.kind === "payment_review") {
    return { options: await renderPaymentReview(message, contact.phone_e164, template.meta_name) } as const;
  }
  if (message.kind === "proof_rejected") {
    return { options: await renderPaymentRejection(message, contact.phone_e164, template.meta_name) } as const;
  }
  if (message.kind === "payment_action_confirmation") {
    return await renderPaymentConfirmation(message, contact.phone_e164, template.meta_name);
  }
  if (message.kind === "weekly_report") {
    return { options: await renderWeeklyReport(message, contact.phone_e164, template.meta_name) } as const;
  }
  throw new Error(`No outbox renderer exists for ${message.kind}.`);
}

async function finish(
  job: OutboxJob,
  workerId: string,
  outcome: "completed" | "retry_wait" | "delivery_uncertain" | "dead_letter" | "suppressed",
  result?: WhatsAppSendResult,
) {
  const admin = getSupabaseAdmin();
  const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)) + Math.floor(Math.random() * 15);
  await admin.rpc("finish_whatsapp_outbox", {
    p_job_id: job.id,
    p_worker: workerId,
    p_outcome: outcome,
    p_available_at: outcome === "retry_wait" ? new Date(Date.now() + delay * 1000).toISOString() : null,
    p_error_code: result?.providerErrorCode ?? null,
    p_error_summary: result?.error?.slice(0, 500) ?? null,
  });
}

async function processJob(job: OutboxJob, workerId: string) {
  const admin = getSupabaseAdmin();
  if (job.expires_at && new Date(job.expires_at) <= new Date()) {
    await admin.from("whatsapp_messages").update({ state: "suppressed" }).eq("id", job.message_id);
    await finish(job, workerId, "suppressed");
    return "suppressed";
  }
  const { data: message } = await admin
    .from("whatsapp_messages")
    .select("id,organization_id,connection_id,contact_id,kind,language_code,intent")
    .eq("id", job.message_id)
    .maybeSingle();
  if (!message) throw new Error("Outbox message is missing.");

  const rendered = await renderMessage(message as MessageRecord);
  if ("suppressed" in rendered) {
    await admin.from("whatsapp_messages").update({
      state: "suppressed",
      error_code: "consent_suppressed",
    }).eq("id", job.message_id);
    await finish(job, workerId, "suppressed", { ok: false, error: rendered.suppressed });
    return "suppressed";
  }

  const startedAt = new Date().toISOString();
  let result: WhatsAppSendResult;
  if ("sessionText" in rendered && typeof rendered.sessionText === "string" && typeof rendered.recipientPhone === "string") {
    result = await sendWhatsAppText(rendered.recipientPhone, rendered.sessionText);
  } else if ("options" in rendered && rendered.options) {
    result = await sendWhatsAppTemplate(rendered.options);
  } else {
    throw new Error("WhatsApp message could not be rendered.");
  }
  await admin.from("whatsapp_delivery_attempts").insert({
    organization_id: job.organization_id,
    message_id: job.message_id,
    outbox_job_id: job.id,
    attempt_number: job.attempts,
    outcome: result.outcome ?? "permanent_failure",
    provider_wamid: result.wamid ?? null,
    http_status: result.httpStatus ?? null,
    provider_error_code: result.providerErrorCode ?? null,
    error_summary: result.error?.slice(0, 500) ?? null,
    started_at: startedAt,
  });

  if (result.ok) {
    await admin.from("whatsapp_messages").update({
      state: "provider_accepted",
      provider_wamid: result.wamid,
      updated_at: new Date().toISOString(),
    }).eq("id", job.message_id);
    if ("challengeId" in rendered && rendered.challengeId && result.wamid) {
      await admin.from("whatsapp_action_challenges").update({
        context_wamid: result.wamid,
      }).eq("id", rendered.challengeId).eq("state", "pending");
    }
    await finish(job, workerId, "completed", result);
    return "sent";
  }
  if (result.outcome === "delivery_uncertain") {
    await admin.from("whatsapp_messages").update({
      state: "delivery_uncertain",
      error_code: "provider_timeout",
    }).eq("id", job.message_id);
    await finish(job, workerId, "delivery_uncertain", result);
    return "uncertain";
  }
  if (result.outcome === "suppressed") {
    await admin.from("whatsapp_messages").update({ state: "suppressed" }).eq("id", job.message_id);
    await finish(job, workerId, "suppressed", result);
    return "suppressed";
  }
  const retry = result.outcome === "retryable" && job.attempts < job.max_attempts;
  await admin.from("whatsapp_messages").update({
    state: retry ? "retry_wait" : "dead_letter",
    error_code: result.providerErrorCode ?? "provider_error",
  }).eq("id", job.message_id);
  await finish(job, workerId, retry ? "retry_wait" : "dead_letter", result);
  return retry ? "retry" : "dead_letter";
}

export async function drainOutbox(workerId: string, limit = 20) {
  const admin = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const { data, error } = await admin.rpc("claim_whatsapp_outbox", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_seconds: 90,
  });
  if (error) throw error;
  const results: Record<string, number> = {};
  for (const job of (data ?? []) as OutboxJob[]) {
    try {
      const outcome = await processJob(job, workerId);
      results[outcome] = (results[outcome] ?? 0) + 1;
    } catch (jobError) {
      const dead = job.attempts >= job.max_attempts;
      const result = {
        ok: false,
        outcome: dead ? "permanent_failure" as const : "retryable" as const,
        error: jobError instanceof Error ? jobError.message : "Outbox processing failed.",
      };
      await finish(job, workerId, dead ? "dead_letter" : "retry_wait", result);
      await admin.from("whatsapp_messages").update({
        state: dead ? "dead_letter" : "retry_wait",
        error_code: "worker_error",
      }).eq("id", job.message_id);
      results[dead ? "dead_letter" : "retry"] = (results[dead ? "dead_letter" : "retry"] ?? 0) + 1;
    }
  }
  await admin.from("whatsapp_worker_heartbeats").upsert({
    worker: "outbox",
    environment: process.env.PGFLOW_ENV ?? "local",
    last_started_at: startedAt,
    last_completed_at: new Date().toISOString(),
    last_result: { claimed: (data ?? []).length, ...results },
    updated_at: new Date().toISOString(),
  });
  return { claimed: (data ?? []).length, ...results };
}

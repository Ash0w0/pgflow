import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
  type SendWhatsAppTemplateOptions,
  type WhatsAppSendResult,
} from "./client";
import {
  renderedParameterSchema,
  templateSchemasMatch,
  type TemplateParameterSchema,
} from "./template-schema";
import { logWhatsAppJobFailure } from "./observability";

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

class SupersededIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupersededIntentError";
  }
}

const essentialTemplateKinds = new Set([
  "proof_received",
  "proof_rejected",
  "receipt",
  "maintenance_update",
  "move_out_update",
  "important_owner_alert",
]);

function tokenPair() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
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
    .select("phone_e164,display_name,consent_state,essential_enabled,reminders_enabled,weekly_report_enabled,routing_active")
    .eq("id", message.contact_id)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (error || !data) throw new Error("WhatsApp contact is unavailable.");
  if (!data.routing_active) {
    throw new SupersededIntentError("WhatsApp contact routing was superseded.");
  }
  return data;
}

function bodyParameters(values: Array<string | number>) {
  return {
    type: "body" as const,
    parameters: values.map((value) => ({ type: "text" as const, text: String(value) })),
  };
}

function urlButton(pathSuffix: string) {
  return {
    type: "button" as const,
    sub_type: "url" as const,
    index: "0",
    // Meta appends this value to the fixed URL prefix approved in the
    // template. Passing a second absolute URL produces a malformed link.
    parameters: [{ type: "text" as const, text: pathSuffix }],
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

function validateRenderedTemplate(
  expected: unknown,
  options: SendWhatsAppTemplateOptions,
) {
  if (!Array.isArray(expected)) {
    throw new Error("The approved WhatsApp template has no parameter schema.");
  }
  const actual = renderedParameterSchema(options.components ?? []);
  if (!templateSchemasMatch(expected as TemplateParameterSchema, actual)) {
    throw new Error("The rendered WhatsApp message does not match its approved template schema.");
  }
  return { options } as const;
}

async function renderWelcomeConsent(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
  displayName: string | null,
): Promise<SendWhatsAppTemplateOptions> {
  const { data: organization, error } = await getSupabaseAdmin()
    .from("organizations")
    .select("name")
    .eq("id", message.organization_id)
    .maybeSingle();
  if (error || !organization) throw new Error("WhatsApp activation organization is unavailable.");
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      displayName || (message.intent.role === "resident" ? "Resident" : "Owner"),
      organization.name,
    ])],
  };
}

async function renderRentReminder(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const admin = getSupabaseAdmin();
  const invoiceId = message.intent.invoiceId;
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("id,property_id,tenant_id,period,due_date,total_amount,paid_amount,state")
    .eq("id", invoiceId)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (invoiceError || !invoice) {
    throw new Error("Invoice is unavailable.");
  }
  const outstanding = Number(invoice.total_amount) - Number(invoice.paid_amount);
  if (!["issued", "partially_paid", "overdue"].includes(invoice.state) || outstanding <= 0) {
    throw new SupersededIntentError("Invoice is no longer payable.");
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
  const paymentPath = `${invoice.id}?token=${encodeURIComponent(token)}`;
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([
        tenant.full_name,
        outstanding.toLocaleString("en-IN"),
        invoice.period,
        property.name,
        invoice.due_date,
      ]),
      urlButton(paymentPath),
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
  const receiptPath = `${receipt.id}?token=${encodeURIComponent(token)}`;
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
      urlButton(receiptPath),
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

async function renderProofReceived(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { payment, tenant } = await paymentSnapshot(message);
  if (payment.state !== "pending_review") {
    throw new SupersededIntentError("Payment acknowledgement was superseded.");
  }
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      tenant?.full_name ?? "Resident",
      Number(payment.amount).toLocaleString("en-IN"),
    ])],
  };
}

async function renderPaymentReview(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { payment, tenant, property, room } = await paymentSnapshot(message);
  if (payment.state !== "pending_review") {
    throw new SupersededIntentError("Payment review is no longer pending.");
  }
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
  if (payment.state !== "rejected") {
    throw new SupersededIntentError("Payment rejection was superseded.");
  }
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
  if (payment.state !== "pending_review") {
    throw new SupersededIntentError("Payment action is no longer pending.");
  }
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

async function renderImportantOwnerAlert(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const admin = getSupabaseAdmin();
  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .select("id,property_id,tenant_id,due_date,total_amount,paid_amount,state")
    .eq("id", message.intent.invoiceId)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (invoiceError || !invoice) {
    throw new Error("Overdue invoice is unavailable.");
  }
  const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));
  if (!["issued", "partially_paid", "overdue"].includes(invoice.state) || outstanding <= 0) {
    throw new SupersededIntentError("Owner overdue alert was superseded.");
  }
  const [{ data: property }, { data: tenant }] = await Promise.all([
    admin.from("properties").select("name").eq("id", invoice.property_id).maybeSingle(),
    admin.from("tenant_profiles").select("full_name").eq("id", invoice.tenant_id).maybeSingle(),
  ]);
  if (!property || !tenant) throw new Error("Owner alert routing data is incomplete.");
  const alertText = message.language_code === "hi"
    ? `${tenant.full_name}: INR ${outstanding.toLocaleString("en-IN")} बकाया`
    : `${tenant.full_name}: INR ${outstanding.toLocaleString("en-IN")} overdue`;
  const dueText = message.language_code === "hi"
    ? `देय तिथि ${invoice.due_date}`
    : `Due ${invoice.due_date}`;
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      property.name,
      alertText,
      dueText,
    ])],
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
  const weekEndDate = new Date(
    new Date(`${message.intent.weekStart}T12:00:00+05:30`).getTime() + 7 * 86_400_000,
  ).toISOString().slice(0, 10);
  const { data: contact, error: contactError } = await admin
    .from("whatsapp_contacts")
    .select("display_name,membership_id")
    .eq("id", message.contact_id)
    .eq("organization_id", message.organization_id)
    .maybeSingle();
  if (contactError || !contact?.membership_id) throw new Error("Weekly report owner is unavailable.");
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("property_id")
    .eq("id", contact.membership_id)
    .eq("organization_id", message.organization_id)
    .eq("state", "active")
    .maybeSingle();
  if (membershipError || !membership?.property_id) throw new Error("Weekly report property is unavailable.");
  const propertyId = membership.property_id;
  const { data: propertyResidents, error: residentError } = await admin
    .from("tenant_profiles")
    .select("id")
    .eq("organization_id", message.organization_id)
    .eq("property_id", propertyId);
  if (residentError) throw new Error("Weekly report residents are unavailable.");
  const residentIds = (propertyResidents ?? []).map((resident) => resident.id);
  const maintenanceResidentIds = residentIds.length > 0
    ? residentIds
    : ["00000000-0000-0000-0000-000000000000"];
  const weeklyResults = await Promise.all([
    admin.from("payments").select("amount").eq("organization_id", message.organization_id)
      .eq("property_id", propertyId)
      .eq("state", "approved").gte("approved_at", start.toISOString()).lt("approved_at", end.toISOString()),
    admin.from("invoices").select("total_amount,paid_amount,state").eq("organization_id", message.organization_id)
      .eq("property_id", propertyId)
      .in("state", ["issued", "partially_paid", "overdue"]),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).eq("state", "occupied"),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).eq("state", "vacant"),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).eq("state", "pending_review"),
    admin.from("occupancies").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).gte("move_in_date", message.intent.weekStart)
      .lt("move_in_date", weekEndDate),
    admin.from("occupancies").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).gte("move_out_date", message.intent.weekStart)
      .lt("move_out_date", weekEndDate),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .in("resident_id", maintenanceResidentIds)
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .in("resident_id", maintenanceResidentIds)
      .eq("status", "resolved").gte("updated_at", start.toISOString()).lt("updated_at", end.toISOString()),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .in("resident_id", maintenanceResidentIds).in("status", ["open", "in_progress"]),
    admin.from("move_out_requests").select("*", { count: "exact", head: true }).eq("organization_id", message.organization_id)
      .eq("property_id", propertyId).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
  ]);
  const weeklyError = weeklyResults.find((result) => result.error)?.error;
  if (weeklyError) throw new Error(`Weekly report data is unavailable: ${weeklyError.message}`);
  const [
    { data: payments },
    { data: invoices },
    { count: occupied },
    { count: vacant },
    { count: pendingReviews },
    { count: movedIn },
    { count: movedOut },
    { count: openedMaintenance },
    { count: resolvedMaintenance },
    { count: outstandingMaintenance },
    { count: moveOutRequests },
  ] = weeklyResults;
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
      `+${movedIn ?? 0}/-${movedOut ?? 0}`,
      pendingReviews ?? 0,
      `${openedMaintenance ?? 0}/${resolvedMaintenance ?? 0}/${outstandingMaintenance ?? 0}`,
      moveOutRequests ?? 0,
    ])],
  };
}

async function maintenanceSnapshot(message: MessageRecord) {
  const admin = getSupabaseAdmin();
  const { data: ticket, error: ticketError } = await admin
    .from("maintenance_tickets")
    .select("id,resident_id,room_number,category,description,status")
    .eq("organization_id", message.organization_id)
    .eq("id", message.intent.ticketId)
    .maybeSingle();
  if (ticketError || !ticket) throw new Error("Maintenance ticket is unavailable.");
  const { data: resident, error: residentError } = await admin
    .from("tenant_profiles")
    .select("full_name")
    .eq("organization_id", message.organization_id)
    .eq("id", ticket.resident_id)
    .maybeSingle();
  if (residentError || !resident) throw new Error("Maintenance resident is unavailable.");
  return { ticket, resident };
}

async function renderMaintenanceCreated(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { ticket, resident } = await maintenanceSnapshot(message);
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([
        resident.full_name,
        ticket.room_number,
        ticket.category,
        ticket.description ?? "No description",
      ]),
      quickReply("0", `maintenance_progress:${ticket.id}`),
      quickReply("1", `maintenance_resolve:${ticket.id}`),
    ],
  };
}

async function renderMaintenanceUpdate(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { ticket, resident } = await maintenanceSnapshot(message);
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      resident.full_name,
      ticket.room_number,
      ticket.category,
      message.intent.event || ticket.status,
    ])],
  };
}

async function moveOutSnapshot(message: MessageRecord) {
  const admin = getSupabaseAdmin();
  const { data: request, error: requestError } = await admin
    .from("move_out_requests")
    .select("id,tenant_id,requested_exit_date,state")
    .eq("organization_id", message.organization_id)
    .eq("id", message.intent.requestId)
    .maybeSingle();
  if (requestError || !request) throw new Error("Move-out request is unavailable.");
  const { data: resident, error: residentError } = await admin
    .from("tenant_profiles")
    .select("full_name")
    .eq("organization_id", message.organization_id)
    .eq("id", request.tenant_id)
    .maybeSingle();
  if (residentError || !resident) throw new Error("Move-out resident is unavailable.");
  return { request, resident };
}

async function renderMoveOutRequest(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { request, resident } = await moveOutSnapshot(message);
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [
      bodyParameters([resident.full_name, request.requested_exit_date]),
      quickReply("0", `moveout_ack:${request.id}`),
    ],
  };
}

async function renderMoveOutUpdate(
  message: MessageRecord,
  recipientPhone: string,
  templateName: string,
): Promise<SendWhatsAppTemplateOptions> {
  const { request, resident } = await moveOutSnapshot(message);
  return {
    recipientPhone,
    templateName,
    languageCode: message.language_code,
    components: [bodyParameters([
      resident.full_name,
      request.requested_exit_date,
      message.intent.event || request.state,
    ])],
  };
}

async function renderMessage(message: MessageRecord) {
  const contact = await contactForMessage(message);
  if (message.kind === "session_reply") {
    const text = message.intent.text;
    if (!text || text.length > 1000) throw new Error("Session reply is invalid.");
    if (contact.consent_state !== "opted_in" && message.intent.allowWithoutConsent !== "true") {
      return { suppressed: "Contact has not opted in." } as const;
    }
    return { sessionText: text, recipientPhone: contact.phone_e164 } as const;
  }
  const essentialAfterOptOut = contact.consent_state === "opted_out"
    && contact.essential_enabled
    && essentialTemplateKinds.has(message.kind);
  if (contact.consent_state !== "opted_in" && !essentialAfterOptOut) {
    return { suppressed: "Contact has not opted in." } as const;
  }
  if (["rent_reminder", "overdue_reminder"].includes(message.kind) && !contact.reminders_enabled) {
    return { suppressed: "Rent reminders are disabled." } as const;
  }
  if (message.kind === "weekly_report" && !contact.weekly_report_enabled) {
    return { suppressed: "Weekly reports are disabled." } as const;
  }
  const template = await approvedTemplate(message);
  if (message.kind === "welcome_consent") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderWelcomeConsent(
        message,
        contact.phone_e164,
        template.meta_name,
        contact.display_name,
      ),
    );
  }
  if (message.kind === "rent_reminder" || message.kind === "overdue_reminder") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderRentReminder(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "receipt") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderReceipt(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "payment_review") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderPaymentReview(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "proof_received") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderProofReceived(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "proof_rejected") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderPaymentRejection(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "important_owner_alert") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderImportantOwnerAlert(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "payment_action_confirmation") {
    const rendered = await renderPaymentConfirmation(message, contact.phone_e164, template.meta_name);
    return {
      ...rendered,
      ...validateRenderedTemplate(template.parameter_schema, rendered.options),
    };
  }
  if (message.kind === "weekly_report") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderWeeklyReport(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "maintenance_created") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderMaintenanceCreated(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "maintenance_update") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderMaintenanceUpdate(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "move_out_request") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderMoveOutRequest(message, contact.phone_e164, template.meta_name),
    );
  }
  if (message.kind === "move_out_update") {
    return validateRenderedTemplate(
      template.parameter_schema,
      await renderMoveOutUpdate(message, contact.phone_e164, template.meta_name),
    );
  }
  throw new Error(`No outbox renderer exists for ${message.kind}.`);
}

class PostDispatchPersistenceError extends Error {
  constructor() {
    super("Meta may have accepted the message, but its delivery result could not be persisted.");
    this.name = "PostDispatchPersistenceError";
  }
}

async function completeAttempt(
  job: OutboxJob,
  workerId: string,
  outcome: "provider_accepted" | "retryable" | "delivery_uncertain" | "permanent_failure" | "suppressed",
  result: WhatsAppSendResult,
  availableAt: string | null = null,
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("complete_whatsapp_outbox_attempt", {
    p_job_id: job.id,
    p_worker: workerId,
    p_outcome: outcome,
    p_provider_wamid: result.wamid ?? null,
    p_http_status: result.httpStatus ?? null,
    p_error_code: result?.providerErrorCode ?? null,
    p_error_summary: result?.error?.slice(0, 500) ?? null,
    p_available_at: availableAt,
  });
  if (error) throw new Error(`WhatsApp attempt persistence failed: ${error.message}`);
  if (!data) throw new Error("WhatsApp attempt lost its worker lease.");
}

async function completePostDispatch(
  job: OutboxJob,
  workerId: string,
  outcome: "provider_accepted" | "delivery_uncertain",
  result: WhatsAppSendResult,
) {
  try {
    await completeAttempt(job, workerId, outcome, result);
  } catch {
    try {
      await completeAttempt(job, workerId, outcome, result);
    } catch {
      throw new PostDispatchPersistenceError();
    }
  }
}

async function processJob(job: OutboxJob, workerId: string) {
  const admin = getSupabaseAdmin();
  if (job.expires_at && new Date(job.expires_at) <= new Date()) {
    await completeAttempt(job, workerId, "suppressed", {
      ok: false,
      outcome: "suppressed",
      error: "The delivery expired before it was attempted.",
    });
    return "suppressed";
  }
  const { data: message, error: messageError } = await admin
    .from("whatsapp_messages")
    .select("id,organization_id,connection_id,contact_id,kind,language_code,intent")
    .eq("id", job.message_id)
    .maybeSingle();
  if (messageError) throw new Error(`Outbox message lookup failed: ${messageError.message}`);
  if (!message) throw new Error("Outbox message is missing.");

  let rendered: Awaited<ReturnType<typeof renderMessage>>;
  try {
    rendered = await renderMessage(message as MessageRecord);
  } catch (renderError) {
    if (renderError instanceof SupersededIntentError) {
      await completeAttempt(job, workerId, "suppressed", {
        ok: false,
        outcome: "suppressed",
        providerErrorCode: "intent_superseded",
        error: renderError.message,
      });
      return "suppressed";
    }
    throw renderError;
  }
  if ("suppressed" in rendered) {
    await completeAttempt(job, workerId, "suppressed", {
      ok: false,
      outcome: "suppressed",
      providerErrorCode: "consent_suppressed",
      error: rendered.suppressed,
    });
    return "suppressed";
  }

  let result: WhatsAppSendResult;
  if ("sessionText" in rendered && typeof rendered.sessionText === "string" && typeof rendered.recipientPhone === "string") {
    result = await sendWhatsAppText(rendered.recipientPhone, rendered.sessionText);
  } else if ("options" in rendered && rendered.options) {
    result = await sendWhatsAppTemplate(rendered.options);
  } else {
    throw new Error("WhatsApp message could not be rendered.");
  }
  if (result.ok) {
    await completePostDispatch(job, workerId, "provider_accepted", result);
    return "sent";
  }
  if (result.outcome === "delivery_uncertain") {
    await completePostDispatch(job, workerId, "delivery_uncertain", result);
    return "uncertain";
  }
  if (result.outcome === "suppressed") {
    await completeAttempt(job, workerId, "suppressed", result);
    return "suppressed";
  }
  const retry = result.outcome === "retryable" && job.attempts < job.max_attempts;
  const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)) + Math.floor(Math.random() * 15);
  await completeAttempt(
    job,
    workerId,
    retry ? "retryable" : "permanent_failure",
    result,
    retry ? new Date(Date.now() + delay * 1000).toISOString() : null,
  );
  return retry ? "retry" : "dead_letter";
}

export async function drainOutbox(workerId: string, limit = 20) {
  const admin = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const results: Record<string, number> = {};
  const { data: recovered, error: recoveryError } = await admin.rpc("recover_stale_whatsapp_outbox");
  if (recoveryError) throw recoveryError;
  let claimed = 0;
  for (let index = 0; index < Math.min(Math.max(limit, 1), 10); index += 1) {
    const { data, error } = await admin.rpc("claim_whatsapp_outbox", {
      p_worker: workerId,
      p_limit: 1,
      p_lease_seconds: 90,
    });
    if (error) throw error;
    const job = (data?.[0] ?? null) as OutboxJob | null;
    if (!job) break;
    claimed += 1;
    try {
      const outcome = await processJob(job, workerId);
      results[outcome] = (results[outcome] ?? 0) + 1;
    } catch (jobError) {
      logWhatsAppJobFailure("outbox", {
        workerId,
        jobId: job.id,
        organizationId: job.organization_id,
        messageId: job.message_id,
        attempt: job.attempts,
      }, jobError);
      if (jobError instanceof PostDispatchPersistenceError) {
        results.uncertain = (results.uncertain ?? 0) + 1;
        continue;
      }
      const dead = job.attempts >= job.max_attempts;
      const result = {
        ok: false,
        outcome: dead ? "permanent_failure" as const : "retryable" as const,
        error: jobError instanceof Error ? jobError.message : "Outbox processing failed.",
      };
      const delay = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)) + Math.floor(Math.random() * 15);
      await completeAttempt(
        job,
        workerId,
        dead ? "permanent_failure" : "retryable",
        { ...result, providerErrorCode: "worker_error" },
        dead ? null : new Date(Date.now() + delay * 1000).toISOString(),
      );
      results[dead ? "dead_letter" : "retry"] = (results[dead ? "dead_letter" : "retry"] ?? 0) + 1;
    }
  }
  const { error: heartbeatError } = await admin.from("whatsapp_worker_heartbeats").upsert({
    worker: "outbox",
    environment: process.env.PGFLOW_ENV ?? "local",
    last_started_at: startedAt,
    last_completed_at: new Date().toISOString(),
    last_result: { claimed, recovered: recovered ?? 0, ...results },
    updated_at: new Date().toISOString(),
  });
  if (heartbeatError) throw heartbeatError;
  return { claimed, recovered: recovered ?? 0, ...results };
}

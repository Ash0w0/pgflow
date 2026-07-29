import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "./client";
import {
  enqueuePaymentConfirmation,
} from "./workflow-enqueue";
import { downloadInboundImage } from "./media";

type WebhookJob = {
  id: string;
  connection_id: string | null;
  event_kind: "message" | "status" | "error" | "unknown";
  provider_wamid: string | null;
  payload: {
    value?: Record<string, unknown>;
    metadata?: { phone_number_id?: string };
  };
  attempts: number;
  lease_owner: string | null;
};

type ContactRecord = {
  id: string;
  organization_id: string;
  consent_state: "unknown" | "opted_in" | "opted_out";
  language_code: "en" | "hi";
  role: "resident" | "owner" | "manager" | "accountant";
  membership_id: string | null;
  tenant_id: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function phoneFromMeta(value: Record<string, unknown>) {
  const raw = typeof value.from === "string"
    ? value.from
    : typeof value.recipient_id === "string"
      ? value.recipient_id
      : "";
  return `+${normalizeWhatsAppPhone(raw)}`;
}

async function recordStatus(job: WebhookJob) {
  const admin = getSupabaseAdmin();
  const status = job.payload.value ?? {};
  const providerWamid = String(status.id ?? "");
  const state = String(status.status ?? "");
  const providerSeconds = Number(status.timestamp);
  if (!providerWamid || !["sent", "delivered", "read", "failed"].includes(state) || !Number.isFinite(providerSeconds)) {
    throw new Error("Malformed WhatsApp status event.");
  }
  const { data, error } = await admin.rpc("apply_whatsapp_status", {
    p_provider_wamid: providerWamid,
    p_status: state,
    p_provider_timestamp: new Date(providerSeconds * 1000).toISOString(),
    p_payload: status,
  });
  if (error) throw new Error(`WhatsApp status persistence failed: ${error.message}`);
  // Meta can deliver a status before the corresponding send projection is
  // visible. Keep the raw webhook retryable instead of losing tenant context.
  if (!data) throw new Error("WhatsApp status arrived before its message projection.");
}

async function resolveConnection(job: WebhookJob) {
  if (job.connection_id) return job.connection_id;
  const phoneNumberId = job.payload.metadata?.phone_number_id;
  if (!phoneNumberId) throw new Error("Webhook phone_number_id is missing.");
  const { data } = await getSupabaseAdmin()
    .from("whatsapp_connections")
    .select("id")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (!data) throw new Error("Webhook connection is not registered.");
  return data.id as string;
}

async function recordConsent(
  organizationId: string,
  contactId: string,
  event: string,
  providerWamid: string,
  value: Record<string, unknown>,
) {
  const { error } = await getSupabaseAdmin().from("whatsapp_consent_events").upsert({
    organization_id: organizationId,
    contact_id: contactId,
    event,
    source: "inbound_command",
    provider_wamid: providerWamid,
    value,
  }, { onConflict: "contact_id,provider_wamid,event", ignoreDuplicates: true });
  if (error) throw new Error(`Consent evidence could not be recorded: ${error.message}`);
}

async function enqueueSessionReply(input: {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  inboundWamid: string;
  purpose: string;
  text: string;
  allowWithoutConsent?: boolean;
}) {
  const { error } = await getSupabaseAdmin().rpc("enqueue_whatsapp_intent", {
    p_organization_id: input.organizationId,
    p_connection_id: input.connectionId,
    p_contact_id: input.contactId,
    p_kind: "session_reply",
    p_language_code: input.languageCode,
    p_dedupe_key: `reply:${input.inboundWamid}:${input.purpose}`,
    p_intent: {
      kind: "session_reply",
      text: input.text.slice(0, 1000),
      allowWithoutConsent: input.allowWithoutConsent ? "true" : "false",
    },
    p_expires_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  });
  if (error) throw error;
}

async function recordMessage(job: WebhookJob) {
  const admin = getSupabaseAdmin();
  const value = job.payload.value ?? {};
  const providerWamid = String(value.id ?? "");
  const phoneE164 = phoneFromMeta(value);
  const connectionId = await resolveConnection(job);
  const textObject = value.text as { body?: string } | undefined;
  const body = textObject?.body?.trim() ?? "";
  const command = body.toUpperCase();
  const interactive = value.interactive as {
    button_reply?: { id?: string };
  } | undefined;
  const legacyButton = value.button as { payload?: string } | undefined;
  const buttonId = interactive?.button_reply?.id ?? legacyButton?.payload ?? "";
  const replyContext = (value.context as { id?: string } | undefined)?.id ?? "";
  const { data: contacts, error } = await admin
    .from("whatsapp_contacts")
    .select("id,organization_id,consent_state,language_code,role,membership_id,tenant_id")
    .eq("connection_id", connectionId)
    .eq("phone_e164", phoneE164);
  if (error) throw error;
  const matches = (contacts ?? []) as ContactRecord[];
  const { data: currentConversation, error: conversationLookupError } = await admin
    .from("whatsapp_conversations")
    .select("state,flow,context,organization_id,contact_id,expires_at").eq("connection_id", connectionId)
    .eq("phone_e164", phoneE164).maybeSingle();
  if (conversationLookupError) throw conversationLookupError;

  if (matches.length === 0) {
    const { error: unresolvedError } = await admin.from("whatsapp_conversations").upsert({
      connection_id: connectionId,
      phone_e164: phoneE164,
      organization_id: null,
      contact_id: null,
      state: "operator_review",
      flow: "unregistered",
      last_inbound_wamid: providerWamid,
      context: { matchCount: 0 },
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id,phone_e164" });
    if (unresolvedError) throw unresolvedError;
    return;
  }

  const globalOptOut = ["STOP", "UNSUBSCRIBE"].includes(command);
  if (globalOptOut) {
    const { error: optOutError } = await admin.rpc("opt_out_whatsapp_phone", {
      p_connection_id: connectionId,
      p_phone_e164: phoneE164,
      p_provider_wamid: providerWamid,
    });
    if (optOutError) throw new Error(`WhatsApp opt-out failed: ${optOutError.message}`);
  }

  let contact: ContactRecord | null = globalOptOut
    ? matches[0]
    : matches.length === 1
      ? matches[0]
      : null;
  if (!contact && replyContext) {
    const { data: repliedMessage, error: replyLookupError } = await admin
      .from("whatsapp_messages")
      .select("organization_id,contact_id")
      .eq("connection_id", connectionId)
      .eq("provider_wamid", replyContext)
      .maybeSingle();
    if (replyLookupError) throw replyLookupError;
    contact = matches.find((candidate) => (
      candidate.id === repliedMessage?.contact_id
      && candidate.organization_id === repliedMessage?.organization_id
    )) ?? null;
  }
  if (
    !contact
    && currentConversation?.state !== "awaiting_pg"
    && currentConversation?.contact_id
    && (!currentConversation.expires_at || new Date(currentConversation.expires_at) > new Date())
  ) {
    contact = matches.find((candidate) => (
      candidate.id === currentConversation.contact_id
      && candidate.organization_id === currentConversation.organization_id
    )) ?? null;
  }
  if (!contact && command.startsWith("START ")) {
    const { data: activation, error: activationLookupError } = await admin
      .from("whatsapp_activation_tokens")
      .select("organization_id,contact_id")
      .eq("token_hash", sha256(body.slice(6).trim()))
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (activationLookupError) throw activationLookupError;
    contact = matches.find((candidate) => (
      candidate.id === activation?.contact_id
      && candidate.organization_id === activation?.organization_id
    )) ?? null;
  }
  if (!contact && currentConversation?.state === "awaiting_pg") {
    const selection = command.match(/^PG\s+(\d{1,2})$/);
    const choices = Array.isArray((currentConversation.context as { contactIds?: unknown } | null)?.contactIds)
      ? (currentConversation.context as { contactIds: string[] }).contactIds
      : [];
    const selectedId = selection ? choices[Number(selection[1]) - 1] : null;
    contact = matches.find((candidate) => candidate.id === selectedId) ?? null;
  }

  if (!contact && matches.length > 1) {
    const { data: organizations, error: organizationError } = await admin
      .from("organizations")
      .select("id,name")
      .in("id", matches.map((candidate) => candidate.organization_id));
    if (organizationError) throw organizationError;
    const names = new Map((organizations ?? []).map((organization) => [organization.id, organization.name]));
    const choices = matches.map((candidate, index) => (
      `${index + 1}. ${names.get(candidate.organization_id) ?? "PG"}`
    ));
    const replyContact = matches.find((candidate) => candidate.consent_state === "opted_in") ?? matches[0];
    await enqueueSessionReply({
      organizationId: replyContact.organization_id,
      connectionId,
      contactId: replyContact.id,
      languageCode: replyContact.language_code,
      inboundWamid: providerWamid,
      purpose: "select-pg",
      text: `Which PG is this about?\n${choices.join("\n")}\nReply PG 1, PG 2, and so on.`,
    });
    const { error: ambiguousError } = await admin.from("whatsapp_conversations").upsert({
      connection_id: connectionId,
      phone_e164: phoneE164,
      organization_id: null,
      contact_id: null,
      state: "awaiting_pg",
      flow: "select_pg",
      last_inbound_wamid: providerWamid,
      context: { matchCount: matches.length, contactIds: matches.map((candidate) => candidate.id) },
      expires_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id,phone_e164" });
    if (ambiguousError) throw ambiguousError;
    return;
  }
  if (!contact) throw new Error("WhatsApp contact routing could not be resolved.");

  let media: { objectKey: string; contentType: string; fileHash: string; size: number } | null = null;
  if (value.type === "image") {
    const mediaId = (value.image as { id?: string } | undefined)?.id;
    if (!mediaId) throw new Error("Inbound image has no media identifier.");
    media = await downloadInboundImage(contact.organization_id, mediaId);
  }
  let conversationState = value.type === "image"
    ? "awaiting_invoice"
    : currentConversation?.state ?? "active";
  let conversationFlow = value.type === "image"
    ? "payment_proof"
    : currentConversation?.flow ?? "menu";
  let conversationContext: Record<string, unknown> = value.type === "image" ? {
    mediaId: (value.image as { id?: string })?.id,
    objectKey: media?.objectKey,
    fileHash: media?.fileHash,
    contentType: media?.contentType,
  } : (currentConversation?.context as Record<string, unknown> | null) ?? {};

  const reviewMatch = buttonId.match(/^review_(approve|reject):([0-9a-f-]{36})$/i);
  const confirmMatch = buttonId.match(/^confirm_(approve|reject):([A-Za-z0-9_-]{32,128})$/);
  const maintenanceMatch = buttonId.match(/^maintenance_(progress|resolve):([0-9a-f-]{36})$/i);
  const moveOutMatch = buttonId.match(/^moveout_ack:([0-9a-f-]{36})$/i);
  if (reviewMatch && contact.membership_id && ["owner", "accountant"].includes(contact.role)) {
    await enqueuePaymentConfirmation({
      organizationId: contact.organization_id,
      connectionId,
      contactId: contact.id,
      languageCode: contact.language_code,
      paymentId: reviewMatch[2],
      decision: reviewMatch[1].toLowerCase() as "approve" | "reject",
      inboundWamid: providerWamid,
    });
  } else if (confirmMatch && replyContext && contact.membership_id && ["owner", "accountant"].includes(contact.role)) {
    const decision = confirmMatch[1].toLowerCase() as "approve" | "reject";
    const { data: result, error: confirmError } = await admin.rpc("confirm_whatsapp_payment_action", {
      p_token_hash: sha256(confirmMatch[2]),
      p_sender_phone: phoneE164,
      p_context_wamid: replyContext,
      p_decision: decision,
      p_reason: decision === "reject" ? "Rejected by owner from WhatsApp" : null,
    });
    if (confirmError) throw new Error(confirmError.message);
    if (!result?.paymentId) throw new Error("Payment confirmation did not return a payment.");
  } else if (
    maintenanceMatch
    && contact.membership_id
    && ["owner", "manager"].includes(contact.role)
  ) {
    const { error: maintenanceError } = await admin.rpc("update_whatsapp_maintenance_ticket", {
      p_contact_id: contact.id,
      p_ticket_id: maintenanceMatch[2],
      p_status: maintenanceMatch[1].toLowerCase() === "resolve" ? "resolved" : "in_progress",
      p_provider_wamid: providerWamid,
    });
    if (maintenanceError) throw new Error(maintenanceError.message);
  } else if (
    moveOutMatch
    && contact.membership_id
    && ["owner", "manager"].includes(contact.role)
  ) {
    const { error: moveOutError } = await admin.rpc("acknowledge_whatsapp_move_out_request", {
      p_contact_id: contact.id,
      p_request_id: moveOutMatch[1],
      p_provider_wamid: providerWamid,
    });
    if (moveOutError) throw new Error(moveOutError.message);
  }

  if (buttonId) {
    // Interactive actions above are deterministic; no free-text command is evaluated.
  } else if (value.type === "image" && contact.role === "resident") {
    const { data: invoices, error: invoiceError } = await admin
      .from("invoices")
      .select("number,total_amount,paid_amount,due_date")
      .eq("organization_id", contact.organization_id)
      .eq("tenant_id", contact.tenant_id)
      .in("state", ["issued", "partially_paid", "overdue"])
      .order("due_date")
      .limit(5);
    if (invoiceError) throw invoiceError;
    if (!invoices?.length) {
      conversationState = "resolved";
      conversationFlow = "payment_proof";
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-no-invoice",
        text: "There is no outstanding invoice for this proof. The image was not submitted for approval.",
      });
    } else {
      conversationState = "awaiting_invoice";
      conversationFlow = "payment_proof";
      const invoiceList = invoices.map((invoice) => (
        `${invoice.number}: ₹${Number(invoice.total_amount) - Number(invoice.paid_amount)}`
      )).join("\n");
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-invoice",
        text: `Which invoice is this payment for?\n${invoiceList}\nReply with the invoice number.`,
      });
    }
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_invoice") {
    const proof = (currentConversation.context as Record<string, unknown> | null) ?? {};
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id,number")
      .eq("organization_id", contact.organization_id)
      .eq("tenant_id", contact.tenant_id)
      .ilike("number", body)
      .in("state", ["issued", "partially_paid", "overdue"])
      .maybeSingle();
    if (invoiceError) throw invoiceError;
    if (!invoice) {
      conversationState = "awaiting_invoice";
      conversationFlow = "payment_proof";
      conversationContext = proof;
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-invoice-invalid",
        text: "That invoice number is not payable. Reply with one of the invoice numbers shown above.",
      });
    } else {
      conversationState = "awaiting_utr";
      conversationFlow = "payment_proof";
      conversationContext = { ...proof, invoiceId: invoice.id, invoiceNumber: invoice.number };
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-utr",
        text: "Reply with the 6–35 character UPI transaction reference (UTR).",
      });
    }
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_utr") {
    const proof = (currentConversation.context as Record<string, unknown> | null) ?? {};
    const utr = command.replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z0-9]{6,35}$/.test(utr)) {
      conversationState = "awaiting_utr";
      conversationFlow = "payment_proof";
      conversationContext = proof;
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-utr-invalid",
        text: "That UTR is invalid. Reply with the 6–35 character transaction reference.",
      });
    } else {
      conversationState = "awaiting_payment_date";
      conversationFlow = "payment_proof";
      conversationContext = { ...proof, utr };
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-date",
        text: "Reply with the payment date as YYYY-MM-DD.",
      });
    }
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_payment_date") {
    const proof = (currentConversation.context as Record<string, unknown> | null) ?? {};
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(body)
      && !Number.isNaN(Date.parse(`${body}T12:00:00+05:30`));
    if (!validDate) {
      conversationState = "awaiting_payment_date";
      conversationFlow = "payment_proof";
      conversationContext = proof;
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-date-invalid",
        text: "That date is invalid. Reply with the payment date as YYYY-MM-DD.",
      });
    } else {
      const { data: payment, error: paymentError } = await admin.rpc("submit_whatsapp_upi_payment_evidence", {
        p_contact_id: contact.id,
        p_invoice_id: String(proof.invoiceId ?? ""),
        p_reference: String(proof.utr ?? ""),
        p_paid_at: `${body}T12:00:00+05:30`,
        p_object_key: String(proof.objectKey ?? ""),
        p_content_type: String(proof.contentType ?? ""),
        p_file_hash: String(proof.fileHash ?? ""),
        p_provider_wamid: providerWamid,
      });
      if (paymentError) {
        if (["22023", "23505", "P0001"].includes(paymentError.code ?? "")) {
          conversationState = "operator_review";
          conversationFlow = "payment_proof";
          conversationContext = { ...proof, failure: paymentError.code };
          await enqueueSessionReply({
            organizationId: contact.organization_id, connectionId, contactId: contact.id,
            languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-rejected-input",
            text: "This proof could not be submitted because its invoice, UTR, date, or image was already used or is invalid. The PG team can review it manually.",
          });
        } else {
          throw new Error(paymentError.message);
        }
      } else {
        conversationState = "resolved";
        conversationFlow = "payment_proof";
        conversationContext = { paymentId: payment.paymentId };
        await enqueueSessionReply({
          organizationId: contact.organization_id, connectionId, contactId: contact.id,
          languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "proof-submitted",
          text: "Your payment proof is under review. The PG owner will verify the bank or UPI account before approval.",
        });
      }
    }
  } else if (currentConversation?.state === "awaiting_pg" && /^PG\s+\d{1,2}$/.test(command)) {
    conversationState = "active";
    conversationFlow = "menu";
    conversationContext = {};
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "pg-selected",
      text: contact.role === "resident"
        ? "PG selected. Reply DUES, PAY, RECEIPTS, ISSUE, MOVE OUT, or HELP."
        : "PG selected. Use the action buttons in PGFlow alerts or reply HELP.",
    });
  } else if (command.startsWith("START ")) {
    const token = body.slice(6).trim();
    const { data: activation, error: activationError } = await admin
      .from("whatsapp_activation_tokens")
      .select("id,policy_version,expires_at,used_at")
      .eq("organization_id", contact.organization_id)
      .eq("contact_id", contact.id)
      .eq("token_hash", sha256(token))
      .maybeSingle();
    if (activationError) throw activationError;
    if (activation && !activation.used_at && new Date(activation.expires_at) > new Date()) {
      const { error: tokenUseError } = await admin.from("whatsapp_activation_tokens")
        .update({ used_at: new Date().toISOString() }).eq("id", activation.id);
      if (tokenUseError) throw tokenUseError;
      const { error: activationUpdateError } = await admin.from("whatsapp_contacts").update({
        consent_state: "opted_in",
        reminders_enabled: true,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", contact.id);
      if (activationUpdateError) throw activationUpdateError;
      await recordConsent(contact.organization_id, contact.id, "opt_in", providerWamid, {
        policyVersion: activation.policy_version,
      });
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "activation-confirmed",
        text: contact.role === "resident"
          ? "WhatsApp is activated for this PG. Reply DUES, PAY, RECEIPTS, ISSUE, MOVE OUT, or HELP."
          : "WhatsApp owner alerts are activated for this PG. Reply HELP for available actions.",
      });
    } else {
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "activation-invalid",
        text: "This activation link is invalid or expired. Ask the PGFlow operator for a new activation link.",
        allowWithoutConsent: true,
      });
    }
  } else if (["STOP", "UNSUBSCRIBE"].includes(command)) {
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "opt-out-confirmed",
      text: "You are opted out of proactive PGFlow WhatsApp messages. Reply START to opt in again.",
      allowWithoutConsent: true,
    });
  } else if (command === "START" || command === "YES") {
    if (contact.consent_state !== "opted_out") {
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "activation-required",
        text: "Use the one-time activation link provided by the PGFlow operator to activate this PG.",
        allowWithoutConsent: true,
      });
    } else {
      const { error: restartError } = await admin.from("whatsapp_contacts").update({
        consent_state: "opted_in",
        reminders_enabled: true,
        updated_at: new Date().toISOString(),
      }).eq("id", contact.id);
      if (restartError) throw restartError;
      await recordConsent(contact.organization_id, contact.id, "opt_in", providerWamid, {
        policyVersion: process.env.WHATSAPP_POLICY_VERSION ?? "2026-07-01",
        resumed: true,
      });
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "restart-confirmed",
        text: "PGFlow WhatsApp messages are active again. Reply HELP for available actions.",
      });
    }
  } else if (command === "LANGUAGE HINDI" || command === "HINDI") {
    const { error: languageError } = await admin.from("whatsapp_contacts").update({
      language_code: "hi",
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    if (languageError) throw languageError;
    await recordConsent(contact.organization_id, contact.id, "language", providerWamid, { language: "hi" });
  } else if (command === "LANGUAGE ENGLISH" || command === "ENGLISH") {
    const { error: languageError } = await admin.from("whatsapp_contacts").update({
      language_code: "en",
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    if (languageError) throw languageError;
    await recordConsent(contact.organization_id, contact.id, "language", providerWamid, { language: "en" });
  } else if (
    contact.role === "resident"
    && (command === "REMINDERS ON" || command === "REMINDERS OFF")
  ) {
    const enabled = command.endsWith("ON");
    const { error: preferenceError } = await admin.from("whatsapp_contacts").update({
      reminders_enabled: enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id).eq("organization_id", contact.organization_id);
    if (preferenceError) throw preferenceError;
    await recordConsent(contact.organization_id, contact.id, "reminders", providerWamid, {
      preference: "rent_reminders",
      enabled,
    });
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "reminder-preference",
      text: `Rent reminders are ${enabled ? "on" : "off"}.`,
      allowWithoutConsent: contact.consent_state !== "opted_in",
    });
  } else if (
    ["owner", "accountant"].includes(contact.role)
    && (command === "WEEKLY ON" || command === "WEEKLY OFF")
  ) {
    const enabled = command.endsWith("ON");
    const { error: preferenceError } = await admin.from("whatsapp_contacts").update({
      weekly_report_enabled: enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id).eq("organization_id", contact.organization_id);
    if (preferenceError) throw preferenceError;
    await recordConsent(contact.organization_id, contact.id, "weekly_report", providerWamid, {
      preference: "weekly_report",
      enabled,
    });
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "weekly-preference",
      text: `Monday weekly reports are ${enabled ? "on" : "off"}.`,
      allowWithoutConsent: contact.consent_state !== "opted_in",
    });
  } else if (command === "ESSENTIAL ON" || command === "ESSENTIAL OFF") {
    const enabled = command.endsWith("ON");
    const { error: preferenceError } = await admin.from("whatsapp_contacts").update({
      essential_enabled: enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id).eq("organization_id", contact.organization_id);
    if (preferenceError) throw preferenceError;
    await recordConsent(contact.organization_id, contact.id, "essential", providerWamid, {
      preference: "essential_updates",
      enabled,
    });
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "essential-preference",
      text: `Essential account and service updates are ${enabled ? "on" : "off"}.`,
      allowWithoutConsent: true,
    });
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_issue_category") {
    const category = command.toLowerCase();
    if (!["wifi", "plumbing", "electrical", "cleaning", "food", "other"].includes(category)) {
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "issue-category-invalid",
        text: "Reply with one category: WIFI, PLUMBING, ELECTRICAL, CLEANING, FOOD, or OTHER.",
      });
      conversationState = "awaiting_issue_category";
      conversationFlow = "maintenance";
    } else {
      conversationState = "awaiting_issue_description";
      conversationFlow = "maintenance";
      conversationContext = { category };
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "issue-description",
        text: "Briefly describe the issue. PGFlow will create a ticket for your room.",
      });
    }
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_issue_description") {
    const category = String((currentConversation.context as Record<string, unknown> | null)?.category ?? "other");
    const { data: ticket, error: ticketError } = await admin.rpc("create_whatsapp_maintenance_ticket", {
      p_contact_id: contact.id, p_category: category, p_description: body, p_provider_wamid: providerWamid,
    });
    if (ticketError) throw new Error(ticketError.message);
    conversationState = "resolved";
    conversationFlow = "maintenance";
    conversationContext = { ticketId: ticket.ticketId };
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "issue-created",
      text: `Maintenance ticket ${ticket.ticketId} was created. Reply HELP to return to the menu.`,
    });
  } else if (contact.role === "resident" && currentConversation?.state === "awaiting_moveout_date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body)) {
      conversationState = "awaiting_moveout_date";
      conversationFlow = "move_out";
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "moveout-date-invalid",
        text: "Reply with the planned exit date as YYYY-MM-DD.",
      });
    } else {
      const { data: moveOut, error: moveOutError } = await admin.rpc("create_whatsapp_move_out_request", {
        p_contact_id: contact.id, p_exit_date: body, p_provider_wamid: providerWamid,
      });
      if (moveOutError) throw new Error(moveOutError.message);
      conversationState = "resolved";
      conversationFlow = "move_out";
      conversationContext = { requestId: moveOut.requestId };
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "moveout-created",
        text: "Your move-out request was recorded. The PG team will acknowledge it and prepare the settlement in PGFlow.",
      });
    }
  } else if (contact.role === "resident" && command === "ISSUE") {
    conversationState = "awaiting_issue_category";
    conversationFlow = "maintenance";
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "issue-category",
      text: "What needs attention? Reply WIFI, PLUMBING, ELECTRICAL, CLEANING, FOOD, or OTHER.",
    });
  } else if (contact.role === "resident" && command === "MOVE OUT") {
    conversationState = "awaiting_moveout_date";
    conversationFlow = "move_out";
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "moveout-date",
      text: "Reply with your planned exit date as YYYY-MM-DD. This creates a request; it does not calculate or approve a refund.",
    });
  } else if (contact.role === "resident" && command === "DUES") {
    const { data: dues, error: duesError } = await admin.from("invoices").select("number,total_amount,paid_amount,due_date")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .in("state", ["issued", "partially_paid", "overdue"]).order("due_date").limit(5);
    if (duesError) throw duesError;
    const text = dues?.length
      ? dues.map((invoice) => `${invoice.number}: ₹${Number(invoice.total_amount) - Number(invoice.paid_amount)} due ${invoice.due_date}`).join("\n")
      : "You have no outstanding rent invoices.";
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "dues", text,
    });
  } else if (contact.role === "resident" && command === "PAY") {
    const { data: invoice, error: invoiceError } = await admin.from("invoices").select("id")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .in("state", ["issued", "partially_paid", "overdue"]).order("due_date").limit(1).maybeSingle();
    if (invoiceError) throw invoiceError;
    if (invoice) {
      const { error: enqueueError } = await admin.rpc("enqueue_whatsapp_intent", {
        p_organization_id: contact.organization_id, p_connection_id: connectionId, p_contact_id: contact.id,
        p_kind: "rent_reminder", p_language_code: contact.language_code,
        p_dedupe_key: `rent:${invoice.id}:resident-request:${providerWamid}`,
        p_intent: { kind: "rent_reminder", invoiceId: invoice.id, stage: "due" },
        p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      if (enqueueError) throw enqueueError;
    } else {
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "pay-none",
        text: "There is no payable rent invoice right now.",
      });
    }
  } else if (contact.role === "resident" && command === "RECEIPTS") {
    const { data: receipts, error: receiptsError } = await admin.from("receipts").select("number,amount,issued_at")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .order("issued_at", { ascending: false }).limit(5);
    if (receiptsError) throw receiptsError;
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "receipts",
      text: receipts?.length
        ? receipts.map((receipt) => `${receipt.number}: ₹${receipt.amount} on ${String(receipt.issued_at).slice(0, 10)}`).join("\n")
        : "No receipts are available yet.",
    });
  } else if (command === "HELP") {
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "help",
      text: contact.role === "resident"
        ? "Reply DUES, PAY, RECEIPTS, ISSUE, MOVE OUT, REMINDERS ON/OFF, ESSENTIAL ON/OFF, LANGUAGE ENGLISH/HINDI, or STOP."
        : "Use PGFlow action buttons. Reply WEEKLY ON/OFF, ESSENTIAL ON/OFF, LANGUAGE ENGLISH/HINDI, or STOP.",
    });
  }

  const { error: inboundMessageError } = await admin.from("whatsapp_messages").upsert({
    organization_id: contact.organization_id,
    connection_id: connectionId,
    contact_id: contact.id,
    direction: "inbound",
    kind: typeof value.type === "string" ? value.type : "unknown",
    provider_wamid: providerWamid,
    state: "delivered",
    state_rank: 2,
    intent: {
      command: ["DUES", "PAY", "RECEIPTS", "ISSUE", "MOVE OUT", "HELP"].includes(command)
        ? command
        : null,
      hasMedia: value.type === "image",
    },
    provider_payload: media ?? {},
  }, { onConflict: "provider_wamid", ignoreDuplicates: true });
  if (inboundMessageError) throw inboundMessageError;

  const { error: conversationError } = await admin.from("whatsapp_conversations").upsert({
    connection_id: connectionId,
    phone_e164: phoneE164,
    organization_id: contact.organization_id,
    contact_id: contact.id,
    state: conversationState,
    flow: conversationFlow,
    last_inbound_wamid: providerWamid,
    context: conversationContext,
    expires_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id,phone_e164" });
  if (conversationError) throw conversationError;
}

async function finishJob(job: WebhookJob, workerId: string, error?: unknown) {
  const admin = getSupabaseAdmin();
  const dead = job.attempts >= 8;
  const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8));
  const { data, error: finishError } = await admin.rpc("finish_whatsapp_webhook", {
    p_event_id: job.id,
    p_worker: workerId,
    p_outcome: error ? (dead ? "dead_letter" : "retry_wait") : "processed",
    p_available_at: error && !dead
      ? new Date(Date.now() + delaySeconds * 1000).toISOString()
      : null,
    p_error_summary: error
      ? error instanceof Error
        ? error.message.slice(0, 500)
        : "Webhook processing failed."
      : null,
  });
  if (finishError) throw new Error(`Webhook completion failed: ${finishError.message}`);
  if (!data) throw new Error("Webhook event lost its worker lease.");
}

export async function drainWebhookEvents(workerId: string, limit = 50) {
  const admin = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  let claimed = 0;
  let processed = 0;
  let failed = 0;
  for (let index = 0; index < Math.min(Math.max(limit, 1), 10); index += 1) {
    const { data, error } = await admin.rpc("claim_whatsapp_webhooks", {
      p_worker: workerId,
      p_limit: 1,
      p_lease_seconds: 90,
    });
    if (error) throw error;
    const job = (data?.[0] ?? null) as WebhookJob | null;
    if (!job) break;
    claimed += 1;
    try {
      if (job.event_kind === "status") await recordStatus(job);
      else if (job.event_kind === "message") await recordMessage(job);
      await finishJob(job, workerId);
      processed += 1;
    } catch (jobError) {
      await finishJob(job, workerId, jobError);
      failed += 1;
    }
  }
  const { error: heartbeatError } = await admin.from("whatsapp_worker_heartbeats").upsert({
    worker: "webhook",
    environment: process.env.PGFLOW_ENV ?? "local",
    last_started_at: startedAt,
    last_completed_at: new Date().toISOString(),
    last_result: { claimed, processed, failed },
    updated_at: new Date().toISOString(),
  });
  if (heartbeatError) throw heartbeatError;
  return { claimed, processed, failed };
}

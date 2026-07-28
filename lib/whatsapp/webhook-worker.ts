import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "./client";
import {
  enqueuePaymentConfirmation,
  enqueueResidentPaymentRejection,
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
};

const stateRanks: Record<string, number> = { provider_accepted: 0, sent: 1, delivered: 2, read: 3 };

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
  const { data: message } = await admin
    .from("whatsapp_messages")
    .select("id,organization_id,state_rank")
    .eq("provider_wamid", providerWamid)
    .maybeSingle();

  // Meta can deliver a status before the corresponding send projection is
  // visible. Keep the raw webhook retryable instead of creating a status row
  // without an organization, which would break tenant isolation.
  if (!message) throw new Error("WhatsApp status arrived before its message projection.");

  await admin.from("whatsapp_status_events").upsert({
    organization_id: message.organization_id,
    message_id: message.id,
    provider_wamid: providerWamid,
    status: state,
    provider_timestamp: new Date(providerSeconds * 1000).toISOString(),
    payload: status,
  }, { onConflict: "provider_wamid,status,provider_timestamp", ignoreDuplicates: true });

  if (state === "failed") {
    if ((message.state_rank ?? 0) < stateRanks.delivered) {
      await admin.from("whatsapp_messages")
        .update({ state: "failed", updated_at: new Date().toISOString() })
        .eq("id", message.id)
        .lt("state_rank", stateRanks.delivered);
    }
    return;
  }
  const rank = stateRanks[state];
  await admin.from("whatsapp_messages")
    .update({ state, state_rank: rank, updated_at: new Date().toISOString() })
    .eq("id", message.id)
    .lt("state_rank", rank);
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
  await getSupabaseAdmin().from("whatsapp_consent_events").insert({
    organization_id: organizationId,
    contact_id: contactId,
    event,
    source: "inbound_command",
    provider_wamid: providerWamid,
    value,
  });
}

async function enqueueSessionReply(input: {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  inboundWamid: string;
  purpose: string;
  text: string;
}) {
  const { error } = await getSupabaseAdmin().rpc("enqueue_whatsapp_intent", {
    p_organization_id: input.organizationId,
    p_connection_id: input.connectionId,
    p_contact_id: input.contactId,
    p_kind: "session_reply",
    p_language_code: input.languageCode,
    p_dedupe_key: `reply:${input.inboundWamid}:${input.purpose}`,
    p_intent: { kind: "session_reply", text: input.text.slice(0, 1000) },
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
  const { data: contacts, error } = await admin
    .from("whatsapp_contacts")
    .select("id,organization_id,consent_state,language_code,role,membership_id,tenant_id")
    .eq("connection_id", connectionId)
    .eq("phone_e164", phoneE164);
  if (error) throw error;

  if (!contacts || contacts.length !== 1) {
    await admin.from("whatsapp_conversations").upsert({
      connection_id: connectionId,
      phone_e164: phoneE164,
      organization_id: null,
      contact_id: null,
      state: contacts?.length ? "awaiting_pg" : "operator_review",
      flow: contacts?.length ? "select_pg" : "unregistered",
      last_inbound_wamid: providerWamid,
      context: { matchCount: contacts?.length ?? 0 },
      updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id,phone_e164" });
    return;
  }

  const contact = contacts[0];
  const { data: currentConversation } = await admin.from("whatsapp_conversations")
    .select("state,flow,context").eq("connection_id", connectionId)
    .eq("phone_e164", phoneE164).maybeSingle();
  const textObject = value.text as { body?: string } | undefined;
  const body = textObject?.body?.trim() ?? "";
  const command = body.toUpperCase();
  let media: { objectKey: string; contentType: string; fileHash: string; size: number } | null = null;
  if (value.type === "image") {
    const mediaId = (value.image as { id?: string } | undefined)?.id;
    if (!mediaId) throw new Error("Inbound image has no media identifier.");
    media = await downloadInboundImage(contact.organization_id, mediaId);
  }
  const interactive = value.interactive as {
    button_reply?: { id?: string };
  } | undefined;
  const legacyButton = value.button as { payload?: string } | undefined;
  const buttonId = interactive?.button_reply?.id ?? legacyButton?.payload ?? "";
  const replyContext = (value.context as { id?: string } | undefined)?.id ?? "";
  let conversationState = value.type === "image" ? "awaiting_invoice" : "active";
  let conversationFlow = value.type === "image" ? "payment_proof" : "menu";
  let conversationContext: Record<string, unknown> = value.type === "image" ? {
    mediaId: (value.image as { id?: string })?.id,
    objectKey: media?.objectKey,
    fileHash: media?.fileHash,
  } : {};

  const reviewMatch = buttonId.match(/^review_(approve|reject):([0-9a-f-]{36})$/i);
  const confirmMatch = buttonId.match(/^confirm_(approve|reject):([A-Za-z0-9_-]{32,128})$/);
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
    if (decision === "approve" && result?.paymentId) {
      const { data: receipt } = await admin.from("receipts").select("id,tenant_id")
        .eq("organization_id", contact.organization_id)
        .eq("payment_id", result.paymentId).maybeSingle();
      if (receipt) {
        const { data: residentContact } = await admin.from("whatsapp_contacts")
          .select("id,language_code").eq("organization_id", contact.organization_id)
          .eq("tenant_id", receipt.tenant_id).eq("consent_state", "opted_in").maybeSingle();
        if (residentContact) {
          await admin.rpc("enqueue_whatsapp_intent", {
            p_organization_id: contact.organization_id,
            p_connection_id: connectionId,
            p_contact_id: residentContact.id,
            p_kind: "receipt",
            p_language_code: residentContact.language_code,
            p_dedupe_key: `receipt:${receipt.id}:issued`,
            p_intent: { kind: "receipt", receiptId: receipt.id },
            p_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          });
        }
      }
    } else if (decision === "reject" && result?.paymentId) {
      await enqueueResidentPaymentRejection(
        result.paymentId,
        "Payment evidence was rejected by the PG owner",
      );
    }
  }

  if (buttonId) {
    // Interactive actions above are deterministic; no free-text command is evaluated.
  } else if (command.startsWith("START ")) {
    const token = body.slice(6).trim();
    const { data: activation } = await admin
      .from("whatsapp_activation_tokens")
      .select("id,policy_version,expires_at,used_at")
      .eq("organization_id", contact.organization_id)
      .eq("contact_id", contact.id)
      .eq("token_hash", sha256(token))
      .maybeSingle();
    if (activation && !activation.used_at && new Date(activation.expires_at) > new Date()) {
      await admin.from("whatsapp_activation_tokens")
        .update({ used_at: new Date().toISOString() }).eq("id", activation.id);
      await admin.from("whatsapp_contacts").update({
        consent_state: "opted_in",
        reminders_enabled: true,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", contact.id);
      await recordConsent(contact.organization_id, contact.id, "opt_in", providerWamid, {
        policyVersion: activation.policy_version,
      });
    }
  } else if (["STOP", "UNSUBSCRIBE"].includes(command)) {
    await admin.from("whatsapp_contacts").update({
      consent_state: "opted_out",
      reminders_enabled: false,
      weekly_report_enabled: false,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    await recordConsent(contact.organization_id, contact.id, "opt_out", providerWamid, {});
  } else if (command === "START" || command === "YES") {
    await admin.from("whatsapp_contacts").update({
      consent_state: "opted_in",
      reminders_enabled: true,
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    await recordConsent(contact.organization_id, contact.id, "opt_in", providerWamid, {});
  } else if (command === "LANGUAGE HINDI" || command === "HINDI") {
    await admin.from("whatsapp_contacts").update({
      language_code: "hi",
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    await recordConsent(contact.organization_id, contact.id, "language", providerWamid, { language: "hi" });
  } else if (command === "LANGUAGE ENGLISH" || command === "ENGLISH") {
    await admin.from("whatsapp_contacts").update({
      language_code: "en",
      updated_at: new Date().toISOString(),
    }).eq("id", contact.id);
    await recordConsent(contact.organization_id, contact.id, "language", providerWamid, { language: "en" });
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
    const { data: dues } = await admin.from("invoices").select("number,total_amount,paid_amount,due_date")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .in("state", ["issued", "partially_paid", "overdue"]).order("due_date").limit(5);
    const text = dues?.length
      ? dues.map((invoice) => `${invoice.number}: ₹${Number(invoice.total_amount) - Number(invoice.paid_amount)} due ${invoice.due_date}`).join("\n")
      : "You have no outstanding rent invoices.";
    await enqueueSessionReply({
      organizationId: contact.organization_id, connectionId, contactId: contact.id,
      languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "dues", text,
    });
  } else if (contact.role === "resident" && command === "PAY") {
    const { data: invoice } = await admin.from("invoices").select("id")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .in("state", ["issued", "partially_paid", "overdue"]).order("due_date").limit(1).maybeSingle();
    if (invoice) {
      await admin.rpc("enqueue_whatsapp_intent", {
        p_organization_id: contact.organization_id, p_connection_id: connectionId, p_contact_id: contact.id,
        p_kind: "rent_reminder", p_language_code: contact.language_code,
        p_dedupe_key: `rent:${invoice.id}:resident-request:${providerWamid}`,
        p_intent: { kind: "rent_reminder", invoiceId: invoice.id, stage: "due" },
        p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
    } else {
      await enqueueSessionReply({
        organizationId: contact.organization_id, connectionId, contactId: contact.id,
        languageCode: contact.language_code, inboundWamid: providerWamid, purpose: "pay-none",
        text: "There is no payable rent invoice right now.",
      });
    }
  } else if (contact.role === "resident" && command === "RECEIPTS") {
    const { data: receipts } = await admin.from("receipts").select("number,amount,issued_at")
      .eq("organization_id", contact.organization_id).eq("tenant_id", contact.tenant_id)
      .order("issued_at", { ascending: false }).limit(5);
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
        ? "Reply DUES, PAY, RECEIPTS, ISSUE, MOVE OUT, LANGUAGE ENGLISH, LANGUAGE HINDI, or STOP."
        : "Use the buttons in PGFlow alerts. Reply STOP to opt out or LANGUAGE HINDI / LANGUAGE ENGLISH.",
    });
  }

  await admin.from("whatsapp_messages").upsert({
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

  await admin.from("whatsapp_conversations").upsert({
    connection_id: connectionId,
    phone_e164: phoneE164,
    organization_id: contact.organization_id,
    contact_id: contact.id,
    state: conversationState,
    flow: conversationFlow,
    last_inbound_wamid: providerWamid,
    context: conversationContext,
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id,phone_e164" });
}

async function finishJob(job: WebhookJob, error?: unknown) {
  const admin = getSupabaseAdmin();
  if (!error) {
    await admin.from("whatsapp_webhook_events").update({
      state: "processed",
      processed_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    }).eq("id", job.id);
    return;
  }
  const dead = job.attempts >= 8;
  const delaySeconds = Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8));
  await admin.from("whatsapp_webhook_events").update({
    state: dead ? "dead_letter" : "retry_wait",
    available_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    last_error_summary: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed.",
  }).eq("id", job.id);
}

export async function drainWebhookEvents(workerId: string, limit = 50) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("claim_whatsapp_webhooks", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_seconds: 90,
  });
  if (error) throw error;
  let processed = 0;
  let failed = 0;
  for (const job of (data ?? []) as WebhookJob[]) {
    try {
      if (job.event_kind === "status") await recordStatus(job);
      else if (job.event_kind === "message") await recordMessage(job);
      await finishJob(job);
      processed += 1;
    } catch (jobError) {
      await finishJob(job, jobError);
      failed += 1;
    }
  }
  await admin.from("whatsapp_worker_heartbeats").upsert({
    worker: "webhook",
    environment: process.env.PGFLOW_ENV ?? "local",
    last_started_at: new Date().toISOString(),
    last_completed_at: new Date().toISOString(),
    last_result: { claimed: (data ?? []).length, processed, failed },
    updated_at: new Date().toISOString(),
  });
  return { claimed: (data ?? []).length, processed, failed };
}

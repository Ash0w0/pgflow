import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

async function activeConnection() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) return null;
  const { data } = await getSupabaseAdmin().from("whatsapp_connections")
    .select("id").eq("phone_number_id", phoneNumberId).in("state", ["test", "live"]).maybeSingle();
  return data?.id as string | undefined;
}

export async function enqueueOwnerPaymentReview(paymentId: string) {
  const admin = getSupabaseAdmin();
  const connectionId = await activeConnection();
  if (!connectionId) return { queued: false, reason: "connection_unavailable" };
  const { data: payment } = await admin.from("payments")
    .select("id,organization_id,property_id,state").eq("id", paymentId).maybeSingle();
  if (!payment || payment.state !== "pending_review") return { queued: false, reason: "payment_unavailable" };
  const { data: memberships } = await admin.from("memberships")
    .select("id").eq("organization_id", payment.organization_id)
    .eq("property_id", payment.property_id).in("role", ["owner", "accountant"]).eq("state", "active");
  const ids = (memberships ?? []).map((row) => row.id);
  if (!ids.length) return { queued: false, reason: "owner_unavailable" };
  const { data: contact } = await admin.from("whatsapp_contacts")
    .select("id,language_code").eq("organization_id", payment.organization_id)
    .in("membership_id", ids).eq("consent_state", "opted_in").limit(1).maybeSingle();
  if (!contact) return { queued: false, reason: "owner_not_activated" };
  const { data, error } = await admin.rpc("enqueue_whatsapp_intent", {
    p_organization_id: payment.organization_id,
    p_connection_id: connectionId,
    p_contact_id: contact.id,
    p_kind: "payment_review",
    p_language_code: contact.language_code,
    p_dedupe_key: `payment-review:${payment.id}:submitted`,
    p_intent: { kind: "payment_review", paymentId: payment.id },
    p_expires_at: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  });
  if (error) throw error;
  return { queued: true, result: data };
}

export async function enqueuePaymentConfirmation(input: {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  paymentId: string;
  decision: "approve" | "reject";
  inboundWamid: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc("enqueue_whatsapp_intent", {
    p_organization_id: input.organizationId,
    p_connection_id: input.connectionId,
    p_contact_id: input.contactId,
    p_kind: "payment_action_confirmation",
    p_language_code: input.languageCode,
    p_dedupe_key: `payment-confirm:${input.paymentId}:${input.decision}:${input.inboundWamid}`,
    p_intent: {
      kind: "payment_action_confirmation",
      paymentId: input.paymentId,
      decision: input.decision,
      inboundWamid: input.inboundWamid,
    },
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function enqueueResidentReceiptForPayment(paymentId: string) {
  const admin = getSupabaseAdmin();
  const { data: receipt } = await admin.from("receipts")
    .select("id,organization_id,tenant_id").eq("payment_id", paymentId).maybeSingle();
  if (!receipt) return { queued: false, reason: "receipt_unavailable" };
  const { data: contact } = await admin.from("whatsapp_contacts")
    .select("id,connection_id,language_code").eq("organization_id", receipt.organization_id)
    .eq("tenant_id", receipt.tenant_id).eq("consent_state", "opted_in").maybeSingle();
  if (!contact) return { queued: false, reason: "resident_not_activated" };
  const { data, error } = await admin.rpc("enqueue_whatsapp_intent", {
    p_organization_id: receipt.organization_id,
    p_connection_id: contact.connection_id,
    p_contact_id: contact.id,
    p_kind: "receipt",
    p_language_code: contact.language_code,
    p_dedupe_key: `receipt:${receipt.id}:issued`,
    p_intent: { kind: "receipt", receiptId: receipt.id },
    p_expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return { queued: true, result: data };
}

export async function enqueueResidentPaymentRejection(paymentId: string, reason: string) {
  const admin = getSupabaseAdmin();
  const { data: payment } = await admin.from("payments")
    .select("id,organization_id,tenant_id,state").eq("id", paymentId).maybeSingle();
  if (!payment || payment.state !== "rejected") {
    return { queued: false, reason: "rejected_payment_unavailable" };
  }
  const { data: contact } = await admin.from("whatsapp_contacts")
    .select("id,connection_id,language_code").eq("organization_id", payment.organization_id)
    .eq("tenant_id", payment.tenant_id).eq("consent_state", "opted_in").maybeSingle();
  if (!contact) return { queued: false, reason: "resident_not_activated" };
  const { data, error } = await admin.rpc("enqueue_whatsapp_intent", {
    p_organization_id: payment.organization_id,
    p_connection_id: contact.connection_id,
    p_contact_id: contact.id,
    p_kind: "proof_rejected",
    p_language_code: contact.language_code,
    p_dedupe_key: `payment:${payment.id}:rejected`,
    p_intent: { kind: "proof_rejected", paymentId: payment.id, reason },
    p_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return { queued: true, result: data };
}

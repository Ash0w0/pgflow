import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type WhatsAppIntent =
  | { kind: "rent_reminder"; invoiceId: string; stage: "t-3" | "due" | "t+2" }
  | { kind: "payment_review"; paymentId: string }
  | { kind: "receipt"; receiptId: string }
  | { kind: "maintenance_update"; ticketId: string; event: string }
  | { kind: "weekly_report"; ownerMembershipId: string; weekStart: string };

type EnqueueContext = {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  dedupeKey: string;
  expiresAt: string | null;
  intent: Record<string, unknown>;
};

type ResolveActorContext = {
  organizationId: string;
  membershipId: string;
  propertyId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseWhatsAppIntent(value: unknown): WhatsAppIntent | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.kind === "rent_reminder" && uuidPattern.test(String(body.invoiceId))) {
    if (!["t-3", "due", "t+2"].includes(String(body.stage))) return null;
    return { kind: body.kind, invoiceId: String(body.invoiceId), stage: body.stage as "t-3" | "due" | "t+2" };
  }
  if (body.kind === "payment_review" && uuidPattern.test(String(body.paymentId))) {
    return { kind: body.kind, paymentId: String(body.paymentId) };
  }
  if (body.kind === "receipt" && uuidPattern.test(String(body.receiptId))) {
    return { kind: body.kind, receiptId: String(body.receiptId) };
  }
  if (body.kind === "maintenance_update" && uuidPattern.test(String(body.ticketId)) && typeof body.event === "string") {
    return { kind: body.kind, ticketId: String(body.ticketId), event: body.event.slice(0, 80) };
  }
  if (
    body.kind === "weekly_report"
    && uuidPattern.test(String(body.ownerMembershipId))
    && /^\d{4}-\d{2}-\d{2}$/.test(String(body.weekStart))
  ) {
    return { kind: body.kind, ownerMembershipId: String(body.ownerMembershipId), weekStart: String(body.weekStart) };
  }
  return null;
}

async function connectionId() {
  const admin = getSupabaseAdmin();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  const { data, error } = await admin
    .from("whatsapp_connections")
    .select("id,state")
    .eq("phone_number_id", phoneNumberId)
    .in("state", ["test", "live"])
    .maybeSingle();
  if (error || !data) throw new Error("The platform WhatsApp connection is not ready.");
  return data.id as string;
}

async function contactForTenant(organizationId: string, tenantId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("whatsapp_contacts")
    .select("id,connection_id,language_code,consent_state,reminders_enabled")
    .eq("organization_id", organizationId)
    .eq("tenant_id", tenantId)
    .eq("role", "resident")
    .maybeSingle();
  if (error || !data) throw new Error("Resident WhatsApp activation is incomplete.");
  if (data.consent_state !== "opted_in") throw new Error("Resident has not opted in.");
  return data;
}

async function contactForMembership(organizationId: string, membershipId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("whatsapp_contacts")
    .select("id,connection_id,language_code,consent_state,weekly_report_enabled")
    .eq("organization_id", organizationId)
    .eq("membership_id", membershipId)
    .maybeSingle();
  if (error || !data) throw new Error("Owner WhatsApp activation is incomplete.");
  if (data.consent_state !== "opted_in") throw new Error("Owner has not opted in.");
  return data;
}

export async function resolveWhatsAppIntent(
  actor: ResolveActorContext,
  input: WhatsAppIntent,
): Promise<EnqueueContext> {
  const admin = getSupabaseAdmin();
  const organizationId = actor.organizationId;
  const configuredConnection = await connectionId();

  if (input.kind === "rent_reminder") {
    const { data: invoice } = await admin
      .from("invoices")
      .select("id,organization_id,property_id,tenant_id,due_date,state")
      .eq("id", input.invoiceId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!invoice || !["issued", "partially_paid", "overdue"].includes(invoice.state)) {
      throw new Error("Invoice is not eligible for a reminder.");
    }
    if (actor.propertyId && invoice.property_id !== actor.propertyId) {
      throw new Error("Invoice is outside this property.");
    }
    const contact = await contactForTenant(organizationId, invoice.tenant_id);
    if (!contact.reminders_enabled) throw new Error("Resident reminders are disabled.");
    return {
      organizationId,
      connectionId: configuredConnection,
      contactId: contact.id,
      languageCode: contact.language_code,
      dedupeKey: `rent:${invoice.id}:${input.stage}`,
      expiresAt: new Date(new Date(invoice.due_date).getTime() + 7 * 86_400_000).toISOString(),
      intent: input,
    };
  }

  if (input.kind === "payment_review") {
    const { data: payment } = await admin
      .from("payments")
      .select("id,organization_id,property_id,state")
      .eq("id", input.paymentId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!payment || payment.state !== "pending_review") {
      throw new Error("Payment is not pending review.");
    }
    if (actor.propertyId && payment.property_id !== actor.propertyId) {
      throw new Error("Payment is outside this property.");
    }
    const contact = await contactForMembership(organizationId, actor.membershipId);
    return {
      organizationId,
      connectionId: configuredConnection,
      contactId: contact.id,
      languageCode: contact.language_code,
      dedupeKey: `payment-review:${payment.id}:submitted`,
      expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
      intent: input,
    };
  }

  if (input.kind === "receipt") {
    const { data: receipt } = await admin
      .from("receipts")
      .select("id,organization_id,property_id,tenant_id")
      .eq("id", input.receiptId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!receipt) throw new Error("Receipt not found.");
    if (actor.propertyId && receipt.property_id !== actor.propertyId) {
      throw new Error("Receipt is outside this property.");
    }
    const contact = await contactForTenant(organizationId, receipt.tenant_id);
    return {
      organizationId,
      connectionId: configuredConnection,
      contactId: contact.id,
      languageCode: contact.language_code,
      dedupeKey: `receipt:${receipt.id}:issued`,
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      intent: input,
    };
  }

  if (input.kind === "maintenance_update") {
    const { data: ticket } = await admin
      .from("maintenance_tickets")
      .select("id,organization_id,resident_id,status")
      .eq("id", input.ticketId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!ticket?.resident_id) throw new Error("Maintenance ticket not found.");
    const { data: tenant } = await admin
      .from("tenant_profiles")
      .select("id,property_id")
      .eq("id", ticket.resident_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!tenant) throw new Error("Maintenance resident not found.");
    if (actor.propertyId && tenant.property_id !== actor.propertyId) {
      throw new Error("Maintenance ticket is outside this property.");
    }
    const contact = await contactForTenant(organizationId, tenant.id);
    return {
      organizationId,
      connectionId: configuredConnection,
      contactId: contact.id,
      languageCode: contact.language_code,
      dedupeKey: `maintenance:${ticket.id}:${input.event}`,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      intent: input,
    };
  }

  if (input.kind === "weekly_report") {
    if (input.ownerMembershipId !== actor.membershipId) {
      throw new Error("Weekly reports can only be requested for the signed-in owner.");
    }
    const { data: membership } = await admin
      .from("memberships")
      .select("id,organization_id,property_id")
      .eq("id", input.ownerMembershipId)
      .eq("organization_id", organizationId)
      .in("role", ["owner", "accountant"])
      .eq("state", "active")
      .maybeSingle();
    if (!membership) throw new Error("Owner membership not found.");
    if (actor.propertyId && membership.property_id !== actor.propertyId) {
      throw new Error("Owner membership is outside this property.");
    }
    const contact = await contactForMembership(organizationId, membership.id);
    if (!contact.weekly_report_enabled) throw new Error("Weekly report is disabled.");
    return {
      organizationId,
      connectionId: configuredConnection,
      contactId: contact.id,
      languageCode: contact.language_code,
      dedupeKey: `weekly:${membership.id}:${input.weekStart}`,
      expiresAt: new Date(new Date(`${input.weekStart}T12:00:00+05:30`).getTime() + 8 * 86_400_000).toISOString(),
      intent: input,
    };
  }

  throw new Error("Unsupported WhatsApp intent.");
}

export async function enqueueWhatsAppIntent(context: EnqueueContext) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("enqueue_whatsapp_intent", {
    p_organization_id: context.organizationId,
    p_connection_id: context.connectionId,
    p_contact_id: context.contactId,
    p_kind: context.intent.kind,
    p_language_code: context.languageCode,
    p_dedupe_key: context.dedupeKey,
    p_intent: context.intent,
    p_expires_at: context.expiresAt,
  });
  if (error) throw new Error(`Unable to enqueue WhatsApp intent: ${error.message}`);
  return data as { messageId: string; state: "queued"; deduplicated: boolean };
}

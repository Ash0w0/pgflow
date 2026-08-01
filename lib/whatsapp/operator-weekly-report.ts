import "server-only";

import { getWhatsAppSendMode } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWeeklyReportWindow } from "@/lib/whatsapp/weekly-report-window";

export type OperatorWeeklyReportMetrics = {
  approvedCollections: number;
  approvedPaymentCount: number;
  outstandingRent: number;
  overdueRent: number;
  occupiedBeds: number;
  totalBeds: number;
  movedIn: number;
  movedOut: number;
  pendingPaymentReviews: number;
  maintenanceOpened: number;
  maintenanceResolved: number;
  maintenanceOutstanding: number;
  moveOutRequests: number;
};

export type OperatorWeeklyReportPreview = {
  organizationId: string;
  organizationName: string;
  ownerMembershipId: string;
  ownerName: string;
  propertyName: string;
  languageCode: "en" | "hi";
  weekStart: string;
  weekEnd: string;
  ready: boolean;
  blockers: string[];
  metrics: OperatorWeeklyReportMetrics;
};

type WeeklyQueueContext = {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  ownerMembershipId: string;
  weekStart: string;
};

export async function loadOperatorWeeklyReport(
  organizationId: string,
  ownerMembershipId: string,
  weekStart: string,
): Promise<{ preview: OperatorWeeklyReportPreview; queueContext: WeeklyQueueContext | null }> {
  const admin = getSupabaseAdmin();
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("id,organization_id,property_id,display_name,role,state")
    .eq("id", ownerMembershipId)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "accountant"])
    .eq("state", "active")
    .maybeSingle();
  if (membershipError || !membership?.property_id) {
    throw new Error("Active owner or accountant membership was not found.");
  }

  const [{ data: organization }, { data: property }, { data: contact, error: contactError }] = await Promise.all([
    admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    admin.from("properties").select("name").eq("organization_id", organizationId)
      .eq("id", membership.property_id).maybeSingle(),
    admin.from("whatsapp_contacts")
      .select("id,connection_id,language_code,consent_state,weekly_report_enabled")
      .eq("organization_id", organizationId)
      .eq("membership_id", ownerMembershipId)
      .eq("routing_active", true)
      .in("role", ["owner", "accountant"])
      .maybeSingle(),
  ]);
  if (contactError) throw new Error("Owner WhatsApp contact could not be loaded.");

  const [{ data: connection }, { data: template }] = contact
    ? await Promise.all([
        admin.from("whatsapp_connections").select("state").eq("id", contact.connection_id).maybeSingle(),
        admin.from("whatsapp_templates").select("id").eq("connection_id", contact.connection_id)
          .eq("purpose", "weekly_report")
          .eq("language_code", contact.language_code)
          .eq("approval_state", "approved")
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const start = new Date(`${weekStart}T00:00:00+05:30`);
  const reportWindow = getWeeklyReportWindow(weekStart);
  const end = new Date(reportWindow.completedAt);
  const weekEnd = reportWindow.weekEnd;
  const { data: propertyResidents, error: residentError } = await admin
    .from("tenant_profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("property_id", membership.property_id);
  if (residentError) throw new Error("Resident data for the weekly report is unavailable.");
  const residentIds = (propertyResidents ?? []).map((resident) => resident.id);
  const scopedResidentIds = residentIds.length > 0
    ? residentIds
    : ["00000000-0000-0000-0000-000000000000"];

  const results = await Promise.all([
    admin.from("payments").select("amount").eq("organization_id", organizationId)
      .eq("property_id", membership.property_id)
      .eq("state", "approved").gte("approved_at", start.toISOString()).lt("approved_at", end.toISOString()),
    admin.from("invoices").select("total_amount,paid_amount,state").eq("organization_id", organizationId)
      .eq("property_id", membership.property_id)
      .in("state", ["issued", "partially_paid", "overdue"]),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).eq("state", "occupied"),
    admin.from("beds").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).eq("state", "vacant"),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).eq("state", "pending_review"),
    admin.from("occupancies").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).gte("move_in_date", weekStart).lt("move_in_date", weekEnd),
    admin.from("occupancies").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).gte("move_out_date", weekStart).lt("move_out_date", weekEnd),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .in("resident_id", scopedResidentIds).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .in("resident_id", scopedResidentIds).eq("status", "resolved")
      .gte("updated_at", start.toISOString()).lt("updated_at", end.toISOString()),
    admin.from("maintenance_tickets").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .in("resident_id", scopedResidentIds).in("status", ["open", "in_progress"]),
    admin.from("move_out_requests").select("*", { count: "exact", head: true }).eq("organization_id", organizationId)
      .eq("property_id", membership.property_id).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
  ]);
  const queryError = results.find((result) => result.error)?.error;
  if (queryError) throw new Error(`Weekly report data is unavailable: ${queryError.message}`);

  const [
    { data: payments },
    { data: invoices },
    { count: occupied },
    { count: vacant },
    { count: pendingReviews },
    { count: movedIn },
    { count: movedOut },
    { count: maintenanceOpened },
    { count: maintenanceResolved },
    { count: maintenanceOutstanding },
    { count: moveOutRequests },
  ] = results;
  const approvedCollections = (payments ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstandingRent = (invoices ?? []).reduce(
    (sum, invoice) => sum + Number(invoice.total_amount) - Number(invoice.paid_amount),
    0,
  );
  const overdueRent = (invoices ?? []).filter((invoice) => invoice.state === "overdue").reduce(
    (sum, invoice) => sum + Number(invoice.total_amount) - Number(invoice.paid_amount),
    0,
  );

  const blockers = [...reportWindow.blockers];
  if (getWhatsAppSendMode() === "disabled") blockers.push("WhatsApp sending is disabled for this environment.");
  if (!contact) blockers.push("Activate this owner on WhatsApp first.");
  else {
    if (contact.consent_state !== "opted_in") blockers.push("Owner consent is not active.");
    if (!contact.weekly_report_enabled) blockers.push("Weekly reports are disabled for this owner.");
    if (!connection || !["test", "live"].includes(connection.state)) blockers.push("The WhatsApp connection is not ready.");
    if (!template) blockers.push(`The ${contact.language_code.toUpperCase()} weekly-report template is not approved.`);
  }

  const languageCode = contact?.language_code === "hi" ? "hi" : "en";
  const preview: OperatorWeeklyReportPreview = {
    organizationId,
    organizationName: organization?.name ?? "Organization",
    ownerMembershipId,
    ownerName: membership.display_name,
    propertyName: property?.name ?? "Property",
    languageCode,
    weekStart,
    weekEnd,
    ready: blockers.length === 0,
    blockers,
    metrics: {
      approvedCollections,
      approvedPaymentCount: payments?.length ?? 0,
      outstandingRent,
      overdueRent,
      occupiedBeds: occupied ?? 0,
      totalBeds: (occupied ?? 0) + (vacant ?? 0),
      movedIn: movedIn ?? 0,
      movedOut: movedOut ?? 0,
      pendingPaymentReviews: pendingReviews ?? 0,
      maintenanceOpened: maintenanceOpened ?? 0,
      maintenanceResolved: maintenanceResolved ?? 0,
      maintenanceOutstanding: maintenanceOutstanding ?? 0,
      moveOutRequests: moveOutRequests ?? 0,
    },
  };
  return {
    preview,
    queueContext: contact && preview.ready
      ? {
          organizationId,
          connectionId: contact.connection_id,
          contactId: contact.id,
          languageCode,
          ownerMembershipId,
          weekStart,
        }
      : null,
  };
}

export async function enqueueOperatorWeeklyReport(context: WeeklyQueueContext) {
  if (getWhatsAppSendMode() === "disabled") {
    throw new Error("WhatsApp sending is disabled for this environment.");
  }
  const reportWindow = getWeeklyReportWindow(context.weekStart);
  if (reportWindow.blockers.length > 0) {
    throw new Error(reportWindow.blockers[0]);
  }
  const admin = getSupabaseAdmin();
  const expiresAt = reportWindow.expiresAt;
  const { data, error } = await admin.rpc("enqueue_whatsapp_intent", {
    p_organization_id: context.organizationId,
    p_connection_id: context.connectionId,
    p_contact_id: context.contactId,
    p_kind: "weekly_report",
    p_language_code: context.languageCode,
    p_dedupe_key: `weekly:${context.ownerMembershipId}:${context.weekStart}`,
    p_intent: {
      kind: "weekly_report",
      ownerMembershipId: context.ownerMembershipId,
      weekStart: context.weekStart,
    },
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Weekly report could not be queued: ${error.message}`);
  return data as { messageId: string; state: "queued"; deduplicated: boolean };
}

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

function indiaDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value; return result;
  }, {});
}

function shiftDate(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function enqueueDueRentReminders(now = new Date()) {
  const parts = indiaDate(now);
  if (parts.hour !== "09") return { due: false, queued: 0, skipped: 0 };
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const stages = new Map([
    [shiftDate(today, 3), "t-3"],
    [today, "due"],
    [shiftDate(today, -2), "t+2"],
  ] as const);
  const admin = getSupabaseAdmin();
  const { data: invoices, error } = await admin.from("invoices")
    .select("id,organization_id,tenant_id,due_date,state")
    .in("due_date", [...stages.keys()])
    .in("state", ["issued", "partially_paid", "overdue"]);
  if (error) throw error;
  let queued = 0;
  let skipped = 0;
  for (const invoice of invoices ?? []) {
    const stage = stages.get(invoice.due_date);
    if (!stage) continue;
    const { data: contact } = await admin.from("whatsapp_contacts")
      .select("id,connection_id,language_code").eq("organization_id", invoice.organization_id)
      .eq("tenant_id", invoice.tenant_id).eq("consent_state", "opted_in")
      .eq("reminders_enabled", true).maybeSingle();
    if (!contact) { skipped += 1; continue; }
    const { data, error: enqueueError } = await admin.rpc("enqueue_whatsapp_intent", {
      p_organization_id: invoice.organization_id,
      p_connection_id: contact.connection_id,
      p_contact_id: contact.id,
      p_kind: "rent_reminder",
      p_language_code: contact.language_code,
      p_dedupe_key: `rent:${invoice.id}:${stage}`,
      p_intent: { kind: "rent_reminder", invoiceId: invoice.id, stage },
      p_expires_at: new Date(`${shiftDate(invoice.due_date, 7)}T23:59:59+05:30`).toISOString(),
    });
    if (enqueueError) throw enqueueError;
    if (!data?.deduplicated) queued += 1;
  }
  return { due: true, queued, skipped };
}

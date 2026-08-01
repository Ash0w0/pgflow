import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

function kolkataParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function previousMonday(dateText: string) {
  // Treat the calendar date as a date, not an instant. Converting Kolkata
  // midnight to UTC before slicing moves it back to Sunday.
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

export async function enqueueDueWeeklyReports(now = new Date()) {
  const parts = kolkataParts(now);
  if (parts.weekday !== "Mon" || parts.hour !== "09") {
    return { due: false, queued: 0, deduplicated: 0 };
  }
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const weekStart = previousMonday(today);
  const admin = getSupabaseAdmin();
  const { data: contacts, error } = await admin.from("whatsapp_contacts")
    .select("id,organization_id,connection_id,membership_id,language_code")
    .in("role", ["owner", "accountant"])
    .eq("routing_active", true)
    .eq("consent_state", "opted_in")
    .eq("weekly_report_enabled", true);
  if (error) throw error;
  let queued = 0;
  let deduplicated = 0;
  for (const contact of contacts ?? []) {
    if (!contact.membership_id) continue;
    const { data, error: enqueueError } = await admin.rpc("enqueue_whatsapp_intent", {
      p_organization_id: contact.organization_id,
      p_connection_id: contact.connection_id,
      p_contact_id: contact.id,
      p_kind: "weekly_report",
      p_language_code: contact.language_code,
      p_dedupe_key: `weekly:${contact.membership_id}:${weekStart}`,
      p_intent: {
        kind: "weekly_report",
        ownerMembershipId: contact.membership_id,
        weekStart,
      },
      p_expires_at: new Date(`${today}T12:00:00+05:30`).toISOString(),
    });
    if (enqueueError) throw enqueueError;
    if (data?.deduplicated) deduplicated += 1;
    else queued += 1;
  }
  return { due: true, weekStart, queued, deduplicated };
}

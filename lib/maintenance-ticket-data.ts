import "server-only";

import { complaints as demoComplaints } from "./demo-data";
import type { MaintenanceTicket, TicketCategory, TicketPriority, TicketStatus } from "./maintenance-tickets";
import { getSupabaseAdmin } from "./supabase/admin";

const CATEGORIES: TicketCategory[] = ["wifi", "plumbing", "electrical", "cleaning", "food", "other"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

function asCategory(value: unknown): TicketCategory {
  return CATEGORIES.includes(value as TicketCategory) ? (value as TicketCategory) : "other";
}

function asPriority(value: unknown): TicketPriority {
  return PRIORITIES.includes(value as TicketPriority) ? (value as TicketPriority) : "medium";
}

function asStatus(value: unknown): TicketStatus {
  return STATUSES.includes(value as TicketStatus) ? (value as TicketStatus) : "open";
}

/** Maps the guided-demo complaint fixtures onto the real maintenance ticket shape. */
export function getDemoMaintenanceTickets(): MaintenanceTicket[] {
  const demoCategories: Record<string, TicketCategory> = {
    Internet: "wifi",
    Plumbing: "plumbing",
    Electricity: "electrical",
    Cleaning: "cleaning",
  };

  return demoComplaints.map((complaint) => ({
    id: complaint.id,
    organizationId: "org_sample_pgflow",
    roomNumber: complaint.room,
    category: demoCategories[complaint.category] ?? "other",
    title: complaint.title,
    status: complaint.state === "resolved" ? "resolved" : complaint.state === "open" ? "open" : "in_progress",
    priority: asPriority(complaint.priority.toLowerCase()),
    createdAt: complaint.updated,
    updatedAt: complaint.updated,
  }));
}

export async function getMaintenanceTickets(organizationId: string): Promise<MaintenanceTicket[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("maintenance_tickets")
    .select("id,organization_id,resident_id,room_number,category,title,description,status,priority,created_at,updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Maintenance tickets could not be loaded: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    residentId: row.resident_id ?? undefined,
    roomNumber: row.room_number,
    category: asCategory(row.category),
    title: row.title,
    description: row.description ?? undefined,
    status: asStatus(row.status),
    priority: asPriority(row.priority),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

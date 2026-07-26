import type { MaintenanceTicket, TicketCategory, TicketPriority } from "@/lib/maintenance-tickets";
import { complaints } from "./data";

const priorities: TicketPriority[] = ["low", "medium", "high", "urgent"];

function asPriority(value: string): TicketPriority {
  return priorities.includes(value as TicketPriority) ? value as TicketPriority : "medium";
}

export function getDemoMaintenanceTickets(): MaintenanceTicket[] {
  const categories: Record<string, TicketCategory> = {
    Internet: "wifi",
    Plumbing: "plumbing",
    Electricity: "electrical",
    Cleaning: "cleaning",
  };
  return complaints.map((complaint) => ({
    id: complaint.id,
    organizationId: "org_sample_pgflow",
    roomNumber: complaint.room,
    category: categories[complaint.category] ?? "other",
    title: complaint.title,
    status: complaint.state === "resolved" ? "resolved" : complaint.state === "open" ? "open" : "in_progress",
    priority: asPriority(complaint.priority.toLowerCase()),
    createdAt: complaint.updated,
    updatedAt: complaint.updated,
  }));
}

/**
 * Business logic and helper functions for PGFlow Maintenance Tickets.
 */

export type TicketCategory =
  | "wifi"
  | "plumbing"
  | "electrical"
  | "cleaning"
  | "food"
  | "other";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface MaintenanceTicket {
  id: string;
  organizationId: string;
  residentId?: string;
  roomNumber: string;
  category: TicketCategory;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
}

export function getCategoryLabel(category: TicketCategory): string {
  switch (category) {
    case "wifi":
      return "📶 Wi-Fi & Internet";
    case "plumbing":
      return "🚰 Plumbing & Water";
    case "electrical":
      return "⚡ Electrical & Lighting";
    case "cleaning":
      return "🧹 Cleaning & Housekeeping";
    case "food":
      return "🍲 Mess & Food";
    case "other":
    default:
      return "🔧 General Repair";
  }
}

export function getNextStatus(currentStatus: TicketStatus): TicketStatus {
  switch (currentStatus) {
    case "open":
      return "in_progress";
    case "in_progress":
      return "resolved";
    case "resolved":
      return "closed";
    case "closed":
    default:
      return "open";
  }
}

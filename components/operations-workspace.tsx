"use client";

import { useState } from "react";
import { AppShell } from "./app-shell";
import {
  Wrench,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Megaphone,
  UserX,
  Filter,
  Search,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  X,
} from "lucide-react";
import { MaintenanceTicketModal } from "./maintenance-ticket-modal";
import { MoveOutModal, type ResidentMoveOutTarget } from "./move-out-modal";
import { WhatsAppSendModal, type WhatsAppSendTarget } from "./whatsapp-send-modal";

export interface TicketItem {
  id: string;
  roomNumber: string;
  residentName: string;
  title: string;
  category: "Plumbing" | "Electrical" | "Wi-Fi" | "Cleaning" | "Furniture" | "Other";
  priority: "Low" | "Medium" | "High" | "Urgent";
  status: "Open" | "In Progress" | "Resolved";
  createdAt: string;
}

const INITIAL_TICKETS: TicketItem[] = [
  {
    id: "TICK-1042",
    roomNumber: "Room 204",
    residentName: "Ananya Rao",
    title: "Wi-Fi router signal drops frequently in evening",
    category: "Wi-Fi",
    priority: "High",
    status: "In Progress",
    createdAt: "24 Jul 2026",
  },
  {
    id: "TICK-1043",
    roomNumber: "Room 102",
    residentName: "Rohan Sharma",
    title: "Bathroom tap dripping continuously",
    category: "Plumbing",
    priority: "Medium",
    status: "Open",
    createdAt: "23 Jul 2026",
  },
  {
    id: "TICK-1044",
    roomNumber: "Room 301",
    residentName: "Priya Patel",
    title: "AC cooling insufficient during daytime",
    category: "Electrical",
    priority: "Urgent",
    status: "Open",
    createdAt: "24 Jul 2026",
  },
  {
    id: "TICK-1040",
    roomNumber: "Room 105",
    residentName: "Kavya Mehta",
    title: "Study chair wheel broken",
    category: "Furniture",
    priority: "Low",
    status: "Resolved",
    createdAt: "20 Jul 2026",
  },
];

const SAMPLE_MOVE_OUT: ResidentMoveOutTarget = {
  id: "res-ananya",
  fullName: "Ananya Rao",
  roomNumber: "Room 204",
  securityDeposit: 10000,
  monthlyRent: 8500,
};

export function OperationsWorkspace({ demoMode }: { demoMode?: boolean }) {
  const [tickets, setTickets] = useState<TicketItem[]>(INITIAL_TICKETS);
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [moveOutModalOpen, setMoveOutModalOpen] = useState(false);
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [noticeTargetFloor, setNoticeTargetFloor] = useState("All Floors");
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredTickets = tickets.filter((ticket) => {
    if (filterStatus === "All") return true;
    return ticket.status === filterStatus;
  });

  function handleCreateTicket(newTicket: { roomNumber: string; residentName: string; title: string; category: any; priority: any }) {
    const item: TicketItem = {
      id: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
      roomNumber: newTicket.roomNumber,
      residentName: newTicket.residentName || "Resident",
      title: newTicket.title,
      category: newTicket.category,
      priority: newTicket.priority,
      status: "Open",
      createdAt: "Today",
    };
    setTickets([item, ...tickets]);
    setTicketModalOpen(false);
    setFeedback(`Ticket ${item.id} logged successfully!`);
  }

  function updateTicketStatus(id: string, newStatus: TicketItem["status"]) {
    setTickets(tickets.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    setFeedback(`Ticket ${id} updated to ${newStatus}.`);
  }

  function handleSendBroadcastNotice(e: React.FormEvent) {
    e.preventDefault();
    setNoticeModalOpen(false);
    setFeedback(`Broadcast notice sent to residents on ${noticeTargetFloor}!`);
    setNoticeText("");
  }

  return (
    <AppShell demoMode={Boolean(demoMode)}>

      <div className="page-stack operations-page">
        <section className="page-heading">
          <div>
            <div className="demo-kicker">
              <Wrench size={14} /> Operations & Maintenance
            </div>
            <h1>PG Operations Control Room</h1>
            <p>Manage resident maintenance tickets, move-out settlements, and operational notices.</p>
          </div>
          <div className="heading-actions flex items-center gap-2">
            <button
              onClick={() => setNoticeModalOpen(true)}
              className="button button-secondary flex items-center gap-2"
            >
              <Megaphone size={16} /> Broadcast Notice
            </button>
            <button
              onClick={() => setMoveOutModalOpen(true)}
              className="button button-secondary flex items-center gap-2"
            >
              <UserX size={16} /> Move-out Settlement
            </button>
            <button
              onClick={() => setTicketModalOpen(true)}
              className="button button-primary flex items-center gap-2"
            >
              <Plus size={16} /> New Ticket
            </button>
          </div>
        </section>

        {feedback && (
          <div className="setup-feedback success flex items-center justify-between" role="status">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} />
              <span>{feedback}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-xs opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* Operational Metrics Grid */}
        <section className="workspace-stat-grid" aria-label="Operations Overview">
          <article className="metric-card">
            <span className="eyebrow">Open Maintenance</span>
            <strong>{tickets.filter((t) => t.status === "Open").length}</strong>
            <p>Awaiting technician assignment</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">In Progress</span>
            <strong>{tickets.filter((t) => t.status === "In Progress").length}</strong>
            <p>Work underway</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Resolved This Month</span>
            <strong>{tickets.filter((t) => t.status === "Resolved").length}</strong>
            <p>100% resolution tracking</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Notice Period</span>
            <strong>01</strong>
            <p>Upcoming move-out in 7 days</p>
          </article>
        </section>

        {/* Maintenance Ticket Register */}
        <section className="panel">
          <header className="panel-head flex items-center justify-between">
            <div>
              <span className="eyebrow">Maintenance Register</span>
              <h2>Active Work Orders</h2>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {["All", "Open", "In Progress", "Resolved"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    filterStatus === status
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </header>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ticket ID</th>
                  <th>Room / Resident</th>
                  <th>Issue Details</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <strong className="font-mono text-xs">{ticket.id}</strong>
                      <small className="block text-slate-400">{ticket.createdAt}</small>
                    </td>
                    <td>
                      <strong>{ticket.roomNumber}</strong>
                      <small className="block text-slate-500">{ticket.residentName}</small>
                    </td>
                    <td className="max-w-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {ticket.title}
                      </span>
                    </td>
                    <td>
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {ticket.category}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          ticket.priority === "Urgent"
                            ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                            : ticket.priority === "High"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          ticket.status === "Resolved"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : ticket.status === "In Progress"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {ticket.status === "Open" && (
                          <button
                            onClick={() => updateTicketStatus(ticket.id, "In Progress")}
                            className="resident-manage-button"
                          >
                            Mark In Progress
                          </button>
                        )}
                        {ticket.status !== "Resolved" && (
                          <button
                            onClick={() => updateTicketStatus(ticket.id, "Resolved")}
                            className="resident-manage-button"
                            style={{ color: "#059669", borderColor: "#a7f3d0" }}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* New Maintenance Ticket Modal */}
      {ticketModalOpen && (
        <MaintenanceTicketModal
          isOpen={ticketModalOpen}
          onClose={() => setTicketModalOpen(false)}
          onSubmit={handleCreateTicket}
        />
      )}

      {/* Move-out Settlement Modal */}
      {moveOutModalOpen && (
        <MoveOutModal
          isOpen={moveOutModalOpen}
          target={SAMPLE_MOVE_OUT}
          onClose={() => setMoveOutModalOpen(false)}
          onSuccess={() => {
            setMoveOutModalOpen(false);
            setFeedback("Move-out settlement processed and security deposit refunded!");
          }}
        />
      )}

      {/* Broadcast Notice Modal */}
      {noticeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Megaphone className="text-emerald-600" size={22} />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Broadcast Resident Notice
                </h3>
              </div>
              <button
                onClick={() => setNoticeModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendBroadcastNotice} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Recipient Group
                </label>
                <select
                  value={noticeTargetFloor}
                  onChange={(e) => setNoticeTargetFloor(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-sm font-medium"
                >
                  <option value="All Floors">All Floors (48 Residents)</option>
                  <option value="Floor 1">Floor 1 Only (16 Residents)</option>
                  <option value="Floor 2">Floor 2 Only (18 Residents)</option>
                  <option value="Floor 3">Floor 3 Only (14 Residents)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Notice Message
                </label>
                <textarea
                  required
                  rows={4}
                  value={noticeText}
                  onChange={(e) => setNoticeText(e.target.value)}
                  placeholder="e.g. Water supply maintenance scheduled tomorrow from 10 AM to 1 PM. Please store water in advance."
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNoticeModalOpen(false)}
                  className="button button-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary flex items-center gap-2">
                  <MessageSquare size={16} />
                  <span>Send Broadcast on WhatsApp</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

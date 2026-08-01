"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./app-shell";
import { CalendarClock, CheckCircle2, Plus, UserX, Wrench, X } from "lucide-react";
import { getCategoryLabel, type MaintenanceTicket, type TicketStatus } from "@/lib/maintenance-tickets";
import type { PendingMoveOutRequest } from "@/lib/move-out-request-data";
import { MaintenanceTicketModal } from "./maintenance-ticket-modal";
import { MoveOutModal, type ResidentMoveOutTarget } from "./move-out-modal";

const STATUS_FILTERS: Array<{ value: TicketStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_CLASSES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
};

const STATUS_CLASSES: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const MOVE_OUT_STATE_LABELS: Record<PendingMoveOutRequest["state"], string> = {
  requested: "New request",
  acknowledged: "Acknowledged",
  settlement_ready: "Settlement ready",
};

export type OperationsData = {
  tickets: MaintenanceTicket[];
  residents: ResidentMoveOutTarget[];
  noticePeriodCount: number;
  moveOutRequests: PendingMoveOutRequest[];
};

export function OperationsWorkspace({
  data,
  demoMode,
  canManage,
}: {
  data: OperationsData;
  demoMode: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<TicketStatus | "all">("all");
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [moveOutResident, setMoveOutResident] = useState<ResidentMoveOutTarget | null>(null);
  const [moveOutPickerOpen, setMoveOutPickerOpen] = useState(false);
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredTickets =
    filterStatus === "all" ? data.tickets : data.tickets.filter((ticket) => ticket.status === filterStatus);

  const openCount = data.tickets.filter((ticket) => ticket.status === "open").length;
  const inProgressCount = data.tickets.filter((ticket) => ticket.status === "in_progress").length;
  const resolvedCount = data.tickets.filter((ticket) => ticket.status === "resolved").length;

  async function updateTicketStatus(ticketId: string, status: TicketStatus) {
    if (pendingTicketId) return;
    setPendingTicketId(ticketId);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/complaints/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The ticket status could not be updated.");

      setFeedback(`Ticket updated to ${STATUS_LABELS[status].toLowerCase()}.`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The ticket status could not be updated.");
    } finally {
      setPendingTicketId(null);
    }
  }

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack operations-page">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <Wrench size={14} /> Operations &amp; maintenance
            </div>
            <h1>Operations</h1>
            <p>Track resident maintenance tickets and move-out settlements for this property.</p>
          </div>
          {canManage && (
            <div className="heading-actions flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMoveOutPickerOpen(true)}
                disabled={data.residents.length === 0}
                title={data.residents.length === 0 ? "No active residents to settle" : undefined}
                className="button button-secondary flex items-center gap-2"
              >
                <UserX size={16} /> Move-out settlement
              </button>
              <button
                type="button"
                onClick={() => setTicketModalOpen(true)}
                className="button button-primary flex items-center gap-2"
              >
                <Plus size={16} /> New ticket
              </button>
            </div>
          )}
        </section>

        {feedback && (
          <div className="setup-feedback success flex items-center justify-between" role="status">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={17} />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Dismiss message"
              className="text-xs opacity-70 hover:opacity-100"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <section className="workspace-stat-grid" aria-label="Operations overview">
          <article className="metric-card">
            <span className="eyebrow">Open tickets</span>
            <strong>{openCount}</strong>
            <p>Awaiting assignment</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">In progress</span>
            <strong>{inProgressCount}</strong>
            <p>Work underway</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Resolved</span>
            <strong>{resolvedCount}</strong>
            <p>Awaiting closure</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">On notice</span>
            <strong>{data.noticePeriodCount}</strong>
            <p>Residents in notice period</p>
          </article>
        </section>

        <section className="panel move-out-request-panel" aria-labelledby="move-out-requests-title">
          <header className="panel-head">
            <div>
              <span className="eyebrow">Resident requests</span>
              <h2 id="move-out-requests-title">Pending move-outs</h2>
              <p>Requests started in WhatsApp stay here until the deposit settlement is completed.</p>
            </div>
            <span className="move-out-request-count">{data.moveOutRequests.length} pending</span>
          </header>

          {data.moveOutRequests.length === 0 ? (
            <div className="collections-empty">
              <CalendarClock size={25} />
              <div>
                <strong>No pending move-out requests</strong>
                <p>Resident requests from WhatsApp will appear here with a direct path to settlement.</p>
              </div>
            </div>
          ) : (
            <div className="move-out-request-list">
              {data.moveOutRequests.map((request) => {
                const resident = data.residents.find((candidate) => candidate.id === request.tenantId) ?? null;
                return (
                  <div className="move-out-request-row" key={request.id}>
                    <span className="move-out-request-icon"><CalendarClock size={18} /></span>
                    <div className="move-out-request-copy">
                      <strong>{request.resident?.fullName ?? "Resident record unavailable"}</strong>
                      <p>
                        Requested exit {formatDate(request.requestedExitDate)}
                        {" · "}Received {formatDate(request.createdAt)}
                      </p>
                    </div>
                    <span className={`move-out-state move-out-state-${request.state}`}>
                      {MOVE_OUT_STATE_LABELS[request.state]}
                    </span>
                    {canManage && (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => resident && setMoveOutResident({
                          ...resident,
                          requestedExitDate: request.requestedExitDate,
                        })}
                        disabled={!resident}
                        title={resident ? "Open the deposit settlement" : "Resident is no longer eligible for settlement"}
                      >
                        Prepare settlement
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <header className="panel-head flex items-center justify-between">
            <div>
              <span className="eyebrow">Maintenance register</span>
              <h2>Work orders</h2>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterStatus(option.value)}
                  aria-pressed={filterStatus === option.value}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    filterStatus === option.value
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </header>

          {filteredTickets.length === 0 ? (
            <div className="collections-empty">
              <Wrench size={25} />
              <div>
                <strong>No tickets to show</strong>
                <p>
                  {data.tickets.length === 0
                    ? "Maintenance complaints logged by residents or staff will appear here."
                    : "No tickets match the selected status filter."}
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>Room</th>
                    <th>Issue</th>
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
                        <strong className="font-mono text-xs">{ticket.id.slice(0, 8)}</strong>
                        <small className="block text-slate-400">{formatDate(ticket.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{ticket.roomNumber}</strong>
                      </td>
                      <td className="max-w-xs">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{ticket.title}</span>
                        {ticket.description && <small className="block text-slate-500">{ticket.description}</small>}
                      </td>
                      <td>
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {getCategoryLabel(ticket.category)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                            PRIORITY_CLASSES[ticket.priority]
                            ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {ticket.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_CLASSES[ticket.status]}`}>
                          {STATUS_LABELS[ticket.status]}
                        </span>
                      </td>
                      <td>
                        <div className="invoice-actions">
                          {canManage && ticket.status === "open" && (
                            <button
                              type="button"
                              className="resident-manage-button"
                              disabled={pendingTicketId === ticket.id}
                              onClick={() => updateTicketStatus(ticket.id, "in_progress")}
                            >
                              Start work
                            </button>
                          )}
                          {canManage && (ticket.status === "open" || ticket.status === "in_progress") && (
                            <button
                              type="button"
                              className="resident-manage-button"
                              disabled={pendingTicketId === ticket.id}
                              onClick={() => updateTicketStatus(ticket.id, "resolved")}
                            >
                              Resolve
                            </button>
                          )}
                          {canManage && ticket.status === "resolved" && (
                            <button
                              type="button"
                              className="resident-manage-button"
                              disabled={pendingTicketId === ticket.id}
                              onClick={() => updateTicketStatus(ticket.id, "closed")}
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <MaintenanceTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        onSuccess={() => {
          setTicketModalOpen(false);
          setFeedback("Maintenance ticket logged.");
          router.refresh();
        }}
      />

      <MoveOutModal
        key={`${moveOutResident?.id ?? "closed"}:${moveOutResident?.requestedExitDate ?? "new"}`}
        isOpen={moveOutResident !== null}
        resident={moveOutResident}
        onClose={() => setMoveOutResident(null)}
        onSuccess={() => {
          setMoveOutResident(null);
          setFeedback("Move-out settlement recorded.");
          router.refresh();
        }}
      />

      {moveOutPickerOpen && (
        <div
          className="setup-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setMoveOutPickerOpen(false)}
        >
          <section className="setup-dialog cash-dialog" role="dialog" aria-modal="true" aria-labelledby="move-out-picker-title">
            <header>
              <div>
                <span className="eyebrow">Deposit settlement</span>
                <h2 id="move-out-picker-title">Select a resident</h2>
                <p>Choose who is moving out to calculate their deposit refund.</p>
              </div>
              <button
                autoFocus
                className="icon-button"
                type="button"
                onClick={() => setMoveOutPickerOpen(false)}
                aria-label="Close resident selection"
              >
                <X size={19} />
              </button>
            </header>
            <div className="modal-form">
              {data.residents.map((resident) => (
                <button
                  key={resident.id}
                  type="button"
                  className="button button-secondary button-full"
                  onClick={() => {
                    setMoveOutPickerOpen(false);
                    setMoveOutResident(resident);
                  }}
                >
                  {resident.fullName}
                  {resident.roomNumber ? ` · ${resident.roomNumber}` : ""}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, BedDouble, IndianRupee, LogOut, Settings2, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import { isDemoRuntime } from "@/lib/runtime";
import { AppShell } from "./app-shell";
import { StatusPill } from "./status-pill";
import { MoveOutModal, type ResidentMoveOutTarget } from "./move-out-modal";
import { ReceiptDownloadButton } from "./receipt-download-button";
import { MaintenanceTicketModal } from "./maintenance-ticket-modal";
import { WhatsAppSendModal, type WhatsAppSendTarget } from "./whatsapp-send-modal";
import { MessageSquare } from "lucide-react";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "lime";
type Workspace = {
  icon: LucideIcon;
  stats: Array<{ label: string; value: string; detail: string }>;
  columns: string[];
  rows: Array<{ cells: string[]; status: string; tone: Tone; residentTarget?: ResidentMoveOutTarget }>;
  workflow: string[];
};

const sampleMoveOutTarget: ResidentMoveOutTarget = {
  id: "demo-res-01",
  fullName: "Ananya Rao",
  roomNumber: "A-204",
  securityDeposit: 10000,
  monthlyRent: 8500,
};

const workspaces: Record<string, Workspace> = {
  Collections: {
    icon: IndianRupee,
    stats: [
      { label: "Issued this month", value: "₹4.73L", detail: "48 fictional invoices" },
      { label: "Pending review", value: "03", detail: "2 UPI · 1 cash" },
      { label: "Overdue", value: "₹41.2K", detail: "6 sample residents" },
    ],
    columns: ["Resident", "Invoice", "Evidence", "Amount"],
    rows: [
      { cells: ["Mira Kapoor · A-204", "INV-0726-018", "DEMO48291073", "₹8,500"], status: "Pending review", tone: "warning" },
      { cells: ["Kavya Mehta · B-105", "INV-0726-031", "DEMO77120644", "₹9,200"], status: "Duplicate warning", tone: "danger" },
      { cells: ["Sana Iyer · C-301", "INV-0726-044", "Cash · front desk", "₹4,000"], status: "Approval needed", tone: "info" },
    ],
    workflow: ["Issue one invoice per billing period", "Review UPI evidence against the PG bank app", "Approve, allocate, then number the receipt", "Correct mistakes through an audited reversal"],
  },
  Residents: {
    icon: Users,
    stats: [
      { label: "Active residents", value: "48", detail: "Across 3 floors" },
      { label: "Notice period", value: "03", detail: "Upcoming vacancies" },
      { label: "Documents due", value: "05", detail: "Private upload checklist" },
    ],
    columns: ["Resident", "Bed", "Rent", "Move-in"],
    rows: [
      { cells: ["Mira Kapoor", "A-204 · Bed 2", "₹8,200", "03 Jan 2026"], status: "Active", tone: "success", residentTarget: { id: "res-1", fullName: "Mira Kapoor", roomNumber: "A-204", securityDeposit: 10000, monthlyRent: 8200 } },
      { cells: ["Ananya Rao", "A-204 · Bed 1", "₹8,500", "18 Aug 2025"], status: "Notice period", tone: "warning", residentTarget: { id: "res-2", fullName: "Ananya Rao", roomNumber: "A-204", securityDeposit: 10000, monthlyRent: 8500 } },
      { cells: ["Sana Iyer", "C-301 · Bed 1", "₹8,000", "11 Feb 2026"], status: "Opening due", tone: "info", residentTarget: { id: "res-3", fullName: "Sana Iyer", roomNumber: "C-301", securityDeposit: 8000, monthlyRent: 8000 } },
    ],
    workflow: ["Validate phone, rent, deposit and move-in date", "Assign exactly one active bed", "Collect only necessary private documents", "Archive access after move-out retention rules"],
  },
  "Rooms & beds": {
    icon: BedDouble,
    stats: [
      { label: "Occupied", value: "48", detail: "80% occupancy" },
      { label: "Available", value: "09", detail: "Including future vacancy" },
      { label: "Maintenance", value: "03", detail: "Blocked from assignment" },
    ],
    columns: ["Room", "Floor", "Occupancy", "Monthly rent"],
    rows: [
      { cells: ["A-204", "First", "2 / 2 beds", "₹8,500"], status: "Notice period", tone: "warning" },
      { cells: ["B-105", "Second", "1 / 2 beds", "₹9,200"], status: "Vacancy", tone: "lime" },
      { cells: ["B-208", "Second", "0 / 2 beds", "₹8,800"], status: "Maintenance", tone: "danger" },
    ],
    workflow: ["Floor → room → bed hierarchy", "Bed-specific rent may override the room default", "Maintenance beds cannot accept occupancy", "Every assignment keeps a full occupancy history"],
  },
  Operations: {
    icon: Wrench,
    stats: [
      { label: "Open complaints", value: "06", detail: "2 need attention" },
      { label: "Move-outs", value: "03", detail: "Next 30 days" },
      { label: "Notices", value: "02", detail: "1 scheduled preview" },
    ],
    columns: ["Work item", "Resident / room", "Owner", "Updated"],
    rows: [
      { cells: ["CMP-1042 · Wi-Fi drops", "Mira · A-204", "Rohan", "18 min ago"], status: "In progress", tone: "info" },
      { cells: ["MOVE-208 · 31 July", "Ananya · A-204", "Priya", "46 min ago"], status: "Under review", tone: "warning", residentTarget: sampleMoveOutTarget },
      { cells: ["Water maintenance", "All residents", "Aarav", "Tomorrow · 11 AM"], status: "Draft", tone: "neutral" },
    ],
    workflow: ["Assign and time-stamp every complaint", "Keep internal and tenant-visible comments separate", "Settle rent, electricity and deposit before bed release", "Respect quiet hours and consent for notices"],
  },
  Reports: {
    icon: BarChart3,
    stats: [
      { label: "Collection rate", value: "81.7%", detail: "Fictional July cycle" },
      { label: "Occupancy", value: "80.0%", detail: "48 of 60 beds" },
      { label: "Deposit liability", value: "₹4.12L", detail: "Separate from revenue" },
    ],
    columns: ["Report", "Period", "Scope", "Format"],
    rows: [
      { cells: ["Collection register", "July 2026", "Invoices + payments", "CSV / XLSX"], status: "Preview ready", tone: "info" },
      { cells: ["Occupancy history", "Last 12 months", "Rooms + beds", "CSV"], status: "Preview ready", tone: "info" },
      { cells: ["Tenant data export", "On request", "One tenant", "ZIP"], status: "Re-auth required", tone: "warning" },
    ],
    workflow: ["Every export remains organization-scoped", "Sensitive exports require owner re-authentication", "Private documents use expiring download links", "Exports and deletion requests are audited"],
  },
  "Property settings": {
    icon: Settings2,
    stats: [
      { label: "Template", value: "v1.0.0", detail: "Fictional demo contract" },
      { label: "Languages", value: "EN + HI", detail: "Full catalog planned" },
      { label: "Integrations", value: "0 live", detail: "Demo-safe by default" },
    ],
    columns: ["Configuration", "Current preview", "Owner control", "Dependency"],
    rows: [
      { cells: ["Rent due day", "5th of each month", "Yes", "None"], status: "Configured", tone: "success" },
      { cells: ["Direct UPI", "Non-payment demo marker", "Re-authentication", "Valid PG VPA"], status: "Disabled", tone: "warning" },
      { cells: ["WhatsApp number", "No number connected", "Operator assist", "Meta verification"], status: "Pending", tone: "warning" },
    ],
    workflow: ["Brand colors pass contrast checks", "UPI and staff permissions require re-authentication", "Subdomain remains available if custom DNS fails", "Template changes are versioned, never forked"],
  },
};

export function GenericSection({ title, description, label, children }: { title: string; description: string; label: string; children?: ReactNode }) {
  const workspace = workspaces[title] ?? workspaces.Operations;
  const Icon = workspace.icon;

  const [activeMoveOutTarget, setActiveMoveOutTarget] = useState<ResidentMoveOutTarget | null>(null);
  const [whatsAppTarget, setWhatsAppTarget] = useState<WhatsAppSendTarget | null>(null);
  const [isMoveOutOpen, setIsMoveOutOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [settledSuccess, setSettledSuccess] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [whatsAppSuccess, setWhatsAppSuccess] = useState(false);

  const openMoveOut = (target?: ResidentMoveOutTarget) => {
    setActiveMoveOutTarget(target ?? sampleMoveOutTarget);
    setIsMoveOutOpen(true);
  };

  const openWhatsAppModal = (type: "rent_due" | "payment_receipt" | "daily_digest" = "rent_due", residentName = "Mira Kapoor", phone = "919876543210") => {
    setWhatsAppTarget({
      type,
      recipientName: residentName,
      recipientPhone: phone,
      amount: 8500,
      billingPeriod: "July 2026",
      pgName: "Sample PG",
      dueDate: "05 July 2026",
    });
    setIsWhatsAppOpen(true);
  };

  return (
    <AppShell demoMode={isDemoRuntime()}>
      <div className="page-stack generic-page">
        <section className="page-heading">
          <div><div className="demo-kicker"><Sparkles size={14} /> Demo mode</div><h1>{title}</h1><p>{description}</p></div>
          <div className="flex items-center gap-3">
            {title === "Operations" && (
              <button onClick={() => setIsTicketOpen(true)} className="button button-secondary">
                <Wrench size={17} /> Log Issue
              </button>
            )}
            {title === "Collections" && (
              <button onClick={() => openWhatsAppModal("rent_due")} className="button button-secondary border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <MessageSquare size={17} /> WhatsApp Reminder
              </button>
            )}
            <button onClick={() => openMoveOut()} className="button button-primary">
              <LogOut size={17} /> Move-Out
            </button>
          </div>
        </section>
        <div className="demo-safety-strip"><ShieldCheck size={16} /><span><strong>Demo data.</strong> All records are simulated. No live data is affected.</span></div>

        {whatsAppSuccess && (
          <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ WhatsApp message sent.
          </div>
        )}

        {ticketSuccess && (
          <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ Maintenance ticket logged.
          </div>
        )}

        <section className="workspace-stat-grid" aria-label={`${title} summary`}>
          {workspace.stats.map((stat) => <article className="metric-card" key={stat.label}><span className="eyebrow">{stat.label}</span><strong>{stat.value}</strong><p>{stat.detail}</p></article>)}
        </section>

        <section className="generic-workspace-grid">
          <article className="panel workspace-table-panel">
            <div className="panel-head"><div><span className="eyebrow">{title}</span><h2>{title}</h2></div></div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {workspace.columns.map((column) => <th key={column}>{column}</th>)}
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.rows.map((row) => (
                    <tr key={row.cells[0]}>
                      {row.cells.map((cell) => <td key={cell}><strong>{cell}</strong></td>)}
                      <td><StatusPill tone={row.tone}>{row.status}</StatusPill></td>
                      <td>
                        {title === "Collections" || title === "Reports" ? (
                          <ReceiptDownloadButton paymentId="demo-pay-01" />
                        ) : (
                          <button
                            onClick={() => openMoveOut(row.residentTarget)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800"
                          >
                            Settle Move-Out
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <aside className="panel workflow-panel"><span className="eyebrow">Workflow</span><h2>Control points</h2><ol>{workspace.workflow.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><Link className="text-button" href="/">Back to overview <ArrowRight size={15} /></Link></aside>
        </section>
        {children}

        <MoveOutModal
          isOpen={isMoveOutOpen}
          resident={activeMoveOutTarget}
          onClose={() => setIsMoveOutOpen(false)}
          onSuccess={() => setSettledSuccess(true)}
        />

        <MaintenanceTicketModal
          isOpen={isTicketOpen}
          onClose={() => setIsTicketOpen(false)}
          onSuccess={() => setTicketSuccess(true)}
        />

        <WhatsAppSendModal
          isOpen={isWhatsAppOpen}
          target={whatsAppTarget}
          onClose={() => setIsWhatsAppOpen(false)}
          onSuccess={() => setWhatsAppSuccess(true)}
        />
      </div>
    </AppShell>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BarChart3, BedDouble, IndianRupee, Settings2, ShieldCheck, Sparkles, Users, Wrench } from "lucide-react";
import { isDemoRuntime } from "@/lib/runtime";
import { AppShell } from "./app-shell";
import { StatusPill } from "./status-pill";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "lime";
type Workspace = {
  icon: LucideIcon;
  stats: Array<{ label: string; value: string; detail: string }>;
  columns: string[];
  rows: Array<{ cells: string[]; status: string; tone: Tone }>;
  workflow: string[];
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
      { cells: ["Mira Kapoor", "A-204 · Bed 2", "₹8,200", "03 Jan 2026"], status: "Active", tone: "success" },
      { cells: ["Ananya Rao", "A-204 · Bed 1", "₹8,500", "18 Aug 2025"], status: "Notice period", tone: "warning" },
      { cells: ["Sana Iyer", "C-301 · Bed 1", "₹8,000", "11 Feb 2026"], status: "Opening due", tone: "info" },
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
      { cells: ["MOVE-208 · 31 July", "Ananya · A-204", "Priya", "46 min ago"], status: "Under review", tone: "warning" },
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
  return (
    <AppShell demoMode={isDemoRuntime()}>
      <div className="page-stack generic-page">
        <section className="page-heading">
          <div><div className="demo-kicker"><Sparkles size={14} /> Fictional demo environment</div><h1>{title}</h1><p>{description}</p></div>
          <span className="button button-primary"><Icon size={17} /> New {label} preview</span>
        </section>
        <div className="demo-safety-strip"><ShieldCheck size={16} /><span><strong>Preview data only.</strong> This workspace demonstrates the intended information hierarchy and states; it does not change a live ledger or resident record.</span></div>

        <section className="workspace-stat-grid" aria-label={`${title} summary`}>
          {workspace.stats.map((stat) => <article className="metric-card" key={stat.label}><span className="eyebrow">{stat.label}</span><strong>{stat.value}</strong><p>{stat.detail}</p></article>)}
        </section>

        <section className="generic-workspace-grid">
          <article className="panel workspace-table-panel">
            <div className="panel-head"><div><span className="eyebrow">Sample register</span><h2>{title} at Nivasa</h2><p>Synthetic records showing the primary review states.</p></div></div>
            <div className="table-wrap"><table className="data-table"><thead><tr>{workspace.columns.map((column) => <th key={column}>{column}</th>)}<th>Status</th></tr></thead><tbody>{workspace.rows.map((row) => <tr key={row.cells[0]}>{row.cells.map((cell) => <td key={cell}><strong>{cell}</strong></td>)}<td><StatusPill tone={row.tone}>{row.status}</StatusPill></td></tr>)}</tbody></table></div>
          </article>
          <aside className="panel workflow-panel"><span className="eyebrow">Control points</span><h2>How this workflow stays safe</h2><ol>{workspace.workflow.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><Link className="text-button" href="/">Return to action centre <ArrowRight size={15} /></Link></aside>
        </section>
        {children}
      </div>
    </AppShell>
  );
}

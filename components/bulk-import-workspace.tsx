"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { AppShell } from "./app-shell";

type Issue = { file: "rooms" | "residents"; row: number; message: string };
type Summary = {
  floorsCreated: number;
  roomsCreated: number;
  roomsAlreadyPresent: number;
  bedsCreated: number;
  residentsOnboarded: number;
  openingDueTotal: number;
};

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function BulkImportWorkspace({ demoMode }: { demoMode: boolean }) {
  const [roomsCsv, setRoomsCsv] = useState("");
  const [residentsCsv, setResidentsCsv] = useState("");
  const [roomsName, setRoomsName] = useState("");
  const [residentsName, setResidentsName] = useState("");
  const [busy, setBusy] = useState<"check" | "commit" | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [checked, setChecked] = useState<Summary | null>(null);
  const [committed, setCommitted] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File | undefined, kind: "rooms" | "residents") {
    setChecked(null); setCommitted(null); setIssues([]); setError(null);
    if (!file) return;
    if (file.size > 512 * 1024) { setError("Each file must be smaller than 512 KB."); return; }
    const text = await file.text();
    if (kind === "rooms") { setRoomsCsv(text); setRoomsName(file.name); } else { setResidentsCsv(text); setResidentsName(file.name); }
  }

  async function run(commit: boolean) {
    if (busy || demoMode) return;
    setBusy(commit ? "commit" : "check");
    setError(null); setIssues([]);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomsCsv, residentsCsv, commit }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; summary?: Summary; issues?: Issue[]; issueCount?: number; error?: string } | null;
      if (result?.issues) {
        setIssues(result.issues);
        setIssueCount(result.issueCount ?? result.issues.length);
        setChecked(null);
        return;
      }
      if (!response.ok || !result?.ok || !result.summary) throw new Error(result?.error ?? "The import could not be completed. Nothing was saved.");
      if (commit) { setCommitted(result.summary); setChecked(null); setRoomsCsv(""); setResidentsCsv(""); setRoomsName(""); setResidentsName(""); }
      else setChecked(result.summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import could not be completed. Nothing was saved.");
    } finally {
      setBusy(null);
    }
  }

  const hasFiles = Boolean(roomsCsv.trim() || residentsCsv.trim());

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack">
        <section className="page-heading">
          <div>
            <div className="eyebrow"><FileSpreadsheet size={14} /> Bulk import</div>
            <h1>Import rooms and residents</h1>
            <p>Upload CSV files exported from Excel or Google Sheets. We check every row first. Nothing is saved until you confirm, and the import saves all rows or none.</p>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><div><span className="eyebrow">Step 1</span><h2>Download the templates</h2><p>Keep the first row (column names). Dates can be DD-MM-YYYY. Phone numbers can be 10 digits. Beds are numbered 1, 2, 3… inside each room.</p></div></header>
          <div className="import-templates">
            <a className="button button-secondary" href="/templates/rooms.csv" download><Download size={15} /> rooms.csv</a>
            <a className="button button-secondary" href="/templates/residents.csv" download><Download size={15} /> residents.csv</a>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head"><div><span className="eyebrow">Step 2</span><h2>Upload and check</h2><p>Rooms that already exist are kept as they are; new floors are created automatically. Residents are placed in the room and bed you name.</p></div></header>
          <div className="import-files">
            <label className="import-drop">
              <Upload size={18} />
              <span><strong>Rooms file</strong>{roomsName || "Choose rooms.csv (optional)"}</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0], "rooms")} disabled={busy !== null || demoMode} />
            </label>
            <label className="import-drop">
              <Upload size={18} />
              <span><strong>Residents file</strong>{residentsName || "Choose residents.csv (optional)"}</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event.target.files?.[0], "residents")} disabled={busy !== null || demoMode} />
            </label>
          </div>
          <button className="button button-primary" type="button" disabled={!hasFiles || busy !== null || demoMode} onClick={() => void run(false)}>
            {busy === "check" ? "Checking every row…" : "Check files"}
          </button>
        </section>

        {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>}

        {issues.length > 0 && (
          <section className="panel" aria-live="polite">
            <header className="panel-head"><div><span className="eyebrow">Fix and re-upload</span><h2>{issueCount} problem{issueCount === 1 ? "" : "s"} found. Nothing was saved.</h2></div></header>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>File</th><th>Row</th><th>Problem</th></tr></thead>
                <tbody>{issues.map((issue, index) => <tr key={index}><td>{issue.file}</td><td>{issue.row || "—"}</td><td>{issue.message}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {checked && (
          <section className="panel" aria-live="polite">
            <header className="panel-head"><div><span className="eyebrow">Step 3</span><h2>Everything checks out. Confirm the totals</h2></div></header>
            <SummaryList summary={checked} />
            <button className="button button-primary" type="button" disabled={busy !== null} onClick={() => void run(true)}>
              {busy === "commit" ? "Importing…" : `Import ${checked.roomsCreated} rooms and ${checked.residentsOnboarded} residents`}
            </button>
          </section>
        )}

        {committed && (
          <section className="panel" role="status">
            <header className="panel-head"><div><span className="eyebrow"><CheckCircle2 size={14} /> Imported</span><h2>Your PG is set up</h2></div></header>
            <SummaryList summary={committed} />
            <div className="import-templates">
              <Link className="button button-secondary" href="/rooms">View rooms &amp; beds</Link>
              <Link className="button button-secondary" href="/residents">View residents</Link>
              <Link className="button button-primary" href="/collections">Generate this month&apos;s rent</Link>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function SummaryList({ summary }: { summary: Summary }) {
  return (
    <ul className="import-summary">
      <li><strong>{summary.floorsCreated}</strong> new floors</li>
      <li><strong>{summary.roomsCreated}</strong> new rooms ({summary.bedsCreated} beds){summary.roomsAlreadyPresent ? `, ${summary.roomsAlreadyPresent} already present` : ""}</li>
      <li><strong>{summary.residentsOnboarded}</strong> residents placed in beds</li>
      <li><strong>{currency.format(summary.openingDueTotal)}</strong> opening dues</li>
    </ul>
  );
}

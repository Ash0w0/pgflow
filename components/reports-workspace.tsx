"use client";

import { useState } from "react";
import { AppShell } from "./app-shell";
import {
  FileBarChart,
  Download,
  Calendar,
  TrendingUp,
  Users,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  PieChart,
} from "lucide-react";

export function ReportsWorkspace({ demoMode }: { demoMode?: boolean }) {
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  function handleExport(reportName: string) {
    setDownloadFeedback(`Exporting ${reportName} report... Download started!`);
    setTimeout(() => setDownloadFeedback(null), 4000);
  }

  return (
    <AppShell demoMode={Boolean(demoMode)}>

      <div className="page-stack reports-page">
        <section className="page-heading flex items-center justify-between">
          <div>
            <div className="eyebrow">
              <FileBarChart size={14} /> Analytics & Financial Reports
            </div>

            <h1>PG Performance Reports</h1>
            <p>Export monthly rent collections, bed occupancy trends, and deposit liability audits.</p>
          </div>
          <div className="heading-actions flex items-center gap-2">
            <button
              onClick={() => handleExport("Full Financial Ledger (CSV)")}
              className="button button-secondary flex items-center gap-2"
            >
              <Download size={16} /> Export CSV
            </button>
            <button
              onClick={() => handleExport("Monthly Executive Summary (PDF)")}
              className="button button-primary flex items-center gap-2"
            >
              <Download size={16} /> Download Executive PDF
            </button>
          </div>
        </section>

        {downloadFeedback && (
          <div className="setup-feedback success flex items-center gap-2" role="status">
            <CheckCircle2 size={17} />
            <span>{downloadFeedback}</span>
          </div>
        )}

        {/* Executive Summary Stat Cards */}
        <section className="workspace-stat-grid" aria-label="Financial Summary">
          <article className="metric-card">
            <span className="eyebrow">July Billed Rent</span>
            <strong>₹4.73L</strong>
            <p>48 active resident invoices</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Total Collected</span>
            <strong>₹4.31L</strong>
            <p>91.1% collection efficiency</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Occupancy Rate</span>
            <strong>92.3%</strong>
            <p>48 of 52 beds occupied</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Deposit Liability</span>
            <strong>₹4.12L</strong>
            <p>Refundable tenant deposits held</p>
          </article>
        </section>

        {/* Financial Breakdown Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="panel">
            <header className="panel-head">
              <div>
                <span className="eyebrow">Monthly Breakdown</span>
                <h2>Rent Collection Register</h2>
              </div>
            </header>
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Direct UPI Collections</strong>
                  <span className="text-xs text-slate-500">Verified via bank UTR proof</span>
                </div>
                <strong className="text-emerald-600 dark:text-emerald-400">₹3,86,000</strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Staff Cash Collections</strong>
                  <span className="text-xs text-slate-500">Audited receipt desk entries</span>
                </div>
                <strong className="text-emerald-600 dark:text-emerald-400">₹45,000</strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Pending Outstanding Dues</strong>
                  <span className="text-xs text-slate-500">6 overdue invoices</span>
                </div>
                <strong className="text-amber-600 dark:text-amber-400">₹42,000</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <div>
                <span className="eyebrow">Occupancy Audit</span>
                <h2>Bed Utilization & Turnover</h2>
              </div>
            </header>
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Occupied Beds</strong>
                  <span className="text-xs text-slate-500">48 beds active</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">48 Beds</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Vacant Ready Beds</strong>
                  <span className="text-xs text-slate-500">Available for onboarding</span>
                </div>
                <span className="font-bold text-emerald-600">03 Beds</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Maintenance Blocked</strong>
                  <span className="text-xs text-slate-500">Room 301 under repair</span>
                </div>
                <span className="font-bold text-amber-600">01 Bed</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

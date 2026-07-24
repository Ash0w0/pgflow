"use client";

import { useState } from "react";
import { AppShell } from "./app-shell";
import { Download, FileBarChart } from "lucide-react";
import type { ReportsData } from "@/lib/reports-types";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-IN", { style: "percent", maximumFractionDigits: 1 });

function toCsv(rows: Array<[string, string | number]>) {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return ["Metric,Value", ...rows.map(([label, value]) => `${escape(label)},${escape(value)}`)].join("\n");
}

export function ReportsWorkspace({ data, demoMode }: { data: ReportsData; demoMode: boolean }) {
  const [exportError, setExportError] = useState<string | null>(null);

  function handleExport() {
    setExportError(null);
    try {
      const csv = toCsv([
        ["Billing period", data.periodLabel],
        ["Invoices issued", data.collections.invoiceCount],
        ["Total billed (INR)", data.collections.totalBilled],
        ["Total collected (INR)", data.collections.totalCollected],
        ["Outstanding (INR)", data.collections.totalOutstanding],
        ["Overdue invoices", data.collections.overdueCount],
        ["Collected via UPI (INR)", data.collections.collectedByUpi],
        ["Collected via cash (INR)", data.collections.collectedByCash],
        ["Total beds", data.occupancy.totalBeds],
        ["Occupied beds", data.occupancy.occupiedBeds],
        ["Vacant beds", data.occupancy.vacantBeds],
        ["Maintenance beds", data.occupancy.maintenanceBeds],
        ["Occupancy rate", percent.format(data.occupancy.occupancyRate)],
        ["Deposit liability (INR)", data.deposits.heldTotal],
        ["Residents with deposits", data.deposits.residentCount],
      ]);

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pgflow-report-${data.periodLabel.toLowerCase().replace(/\s+/g, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("The report could not be exported in this browser.");
    }
  }

  const collectionRate =
    data.collections.totalBilled > 0 ? data.collections.totalCollected / data.collections.totalBilled : 0;

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack reports-page">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <FileBarChart size={14} /> Analytics &amp; financial reports
            </div>
            <h1>Reports</h1>
            <p>
              Rent collection, bed occupancy, and deposit liability for {data.periodLabel}.
            </p>
          </div>
          <div className="heading-actions flex items-center gap-2">
            <button type="button" onClick={handleExport} className="button button-secondary flex items-center gap-2">
              <Download size={16} /> Export CSV
            </button>
          </div>
        </section>

        {exportError && (
          <p className="form-error" role="alert">
            {exportError}
          </p>
        )}

        <section className="workspace-stat-grid" aria-label="Financial summary">
          <article className="metric-card">
            <span className="eyebrow">Billed</span>
            <strong>{currency.format(data.collections.totalBilled)}</strong>
            <p>{data.collections.invoiceCount} invoices issued</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Collected</span>
            <strong>{currency.format(data.collections.totalCollected)}</strong>
            <p>{percent.format(collectionRate)} of billed</p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Occupancy</span>
            <strong>{percent.format(data.occupancy.occupancyRate)}</strong>
            <p>
              {data.occupancy.occupiedBeds} of {data.occupancy.totalBeds} beds occupied
            </p>
          </article>
          <article className="metric-card">
            <span className="eyebrow">Deposit liability</span>
            <strong>{currency.format(data.deposits.heldTotal)}</strong>
            <p>Refundable across {data.deposits.residentCount} residents</p>
          </article>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="panel">
            <header className="panel-head">
              <div>
                <span className="eyebrow">Monthly breakdown</span>
                <h2>Rent collection register</h2>
              </div>
            </header>
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Direct UPI collections</strong>
                  <span className="text-xs text-slate-500">Approved against bank UTR proof</span>
                </div>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {currency.format(data.collections.collectedByUpi)}
                </strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Staff cash collections</strong>
                  <span className="text-xs text-slate-500">Approved receipt desk entries</span>
                </div>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {currency.format(data.collections.collectedByCash)}
                </strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Outstanding dues</strong>
                  <span className="text-xs text-slate-500">
                    {data.collections.overdueCount} overdue{" "}
                    {data.collections.overdueCount === 1 ? "invoice" : "invoices"}
                  </span>
                </div>
                <strong className="text-amber-600 dark:text-amber-400">
                  {currency.format(data.collections.totalOutstanding)}
                </strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <div>
                <span className="eyebrow">Occupancy audit</span>
                <h2>Bed utilization</h2>
              </div>
            </header>
            <div className="space-y-4 text-sm">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Occupied beds</strong>
                  <span className="text-xs text-slate-500">Currently assigned to residents</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">{data.occupancy.occupiedBeds}</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Vacant beds</strong>
                  <span className="text-xs text-slate-500">Available for onboarding</span>
                </div>
                <span className="font-bold text-emerald-600">{data.occupancy.vacantBeds}</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="block text-slate-900 dark:text-white">Maintenance blocked</strong>
                  <span className="text-xs text-slate-500">Out of service</span>
                </div>
                <span className="font-bold text-amber-600">{data.occupancy.maintenanceBeds}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

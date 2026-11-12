"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, FileText, Flag, Scale } from "lucide-react";
import type { ApprovedPaymentRow, PaymentClaimRow } from "@/lib/collections-types";
import { StatusPill } from "./status-pill";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

function formatDate(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "—" : dateFormat.format(time);
}

async function send(method: "POST" | "PATCH", body: Record<string, unknown>) {
  const response = await fetch("/api/payments/claims", {
    method,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null) as { error?: string; claim?: { correctionInvoiceNumber?: string } } | null;
  if (!response.ok) throw new Error(result?.error ?? "The claim could not be saved.");
  return result;
}

export function PaymentClaimsPanel({
  approvedPayments,
  claims,
  canResolve,
}: {
  approvedPayments: ApprovedPaymentRow[];
  claims: PaymentClaimRow[];
  canResolve: boolean;
}) {
  const router = useRouter();
  const [claimFor, setClaimFor] = useState<ApprovedPaymentRow | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const openClaims = claims.filter((claim) => claim.state === "open");
  const resolvedClaims = claims.filter((claim) => claim.state !== "open").slice(0, 10);

  async function raise(event: FormEvent) {
    event.preventDefault();
    if (!claimFor || busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      await send("POST", { paymentId: claimFor.id, reason });
      setSuccess(`Claim raised for ${claimFor.residentName}'s payment. The owner will review it; the receipt stays unchanged.`);
      setClaimFor(null); setReason("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The claim could not be raised.");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(claim: PaymentClaimRow, decision: "uphold" | "dismiss") {
    if (busy) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const result = await send("PATCH", { claimId: claim.id, decision, note: notes[claim.id] ?? "" });
      setSuccess(decision === "uphold"
        ? `Claim upheld. Correction due ${result?.claim?.correctionInvoiceNumber ?? ""} of ${currency.format(claim.amount)} was added for ${claim.residentName}. The original receipt is kept.`
        : "Claim dismissed. Nothing changed in the ledger.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The claim could not be resolved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="approved-payments-title">
      <header className="panel-head">
        <div>
          <span className="eyebrow"><Scale size={14} /> Approved payments</span>
          <h2 id="approved-payments-title">Receipts &amp; claims</h2>
          <p>Approved payments are never reversed. If one was approved by mistake, raise a claim: the owner can add a correction due, and both records stay in the history.</p>
        </div>
        {openClaims.length > 0 && <span className="resident-count">{openClaims.length} open claim{openClaims.length === 1 ? "" : "s"}</span>}
      </header>

      {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>}
      {success && <div className="setup-feedback success" role="status"><span>{success}</span></div>}

      {openClaims.length > 0 && (
        <div className="claims-open">
          <h3><Flag size={15} /> Open claims</h3>
          {openClaims.map((claim) => (
            <div className="claim-row" key={claim.id}>
              <div>
                <strong>{claim.residentName} · {currency.format(claim.amount)}</strong>
                <small>Raised {formatDate(claim.raisedAt)}: {claim.reason}</small>
              </div>
              {canResolve ? (
                <div className="claim-actions">
                  <input aria-label={`Decision note for ${claim.residentName}`} placeholder="Note (optional)" maxLength={500} value={notes[claim.id] ?? ""} onChange={(event) => setNotes({ ...notes, [claim.id]: event.target.value })} />
                  <button className="resident-manage-button" type="button" disabled={busy} onClick={() => void resolve(claim, "uphold")}>Uphold: add correction due</button>
                  <button className="resident-manage-button" type="button" disabled={busy} onClick={() => void resolve(claim, "dismiss")}>Dismiss</button>
                </div>
              ) : <StatusPill tone="warning">Waiting for owner</StatusPill>}
            </div>
          ))}
        </div>
      )}

      {approvedPayments.length === 0 ? (
        <div className="collections-empty"><FileText size={25} /><div><strong>No approved payments yet</strong><p>Approved UPI and cash payments with their receipts will appear here.</p></div></div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Resident</th><th>Method</th><th>Amount</th><th>Approved</th><th>Receipt</th><th>Actions</th></tr></thead>
            <tbody>
              {approvedPayments.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>{payment.residentName}</strong><small>{payment.reference}</small></td>
                  <td>{payment.method.toUpperCase()}</td>
                  <td><strong>{currency.format(payment.amount)}</strong></td>
                  <td>{formatDate(payment.approvedAt)}</td>
                  <td>{payment.receiptNumber
                    ? <a href={`/api/payments/${payment.id}/receipt`} target="_blank" rel="noreferrer">{payment.receiptNumber}</a>
                    : "—"}</td>
                  <td>
                    {payment.claimState === "open" ? <StatusPill tone="warning">Claim open</StatusPill>
                      : payment.claimState === "upheld" ? <StatusPill tone="info">Corrected</StatusPill>
                      : <button className="resident-manage-button" type="button" disabled={busy} onClick={() => { setClaimFor(payment); setReason(""); }}>Approved by mistake?</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resolvedClaims.length > 0 && (
        <details className="claims-history">
          <summary>Resolved claims ({resolvedClaims.length})</summary>
          <ul>
            {resolvedClaims.map((claim) => (
              <li key={claim.id}>
                <StatusPill tone={claim.state === "upheld" ? "info" : "neutral"}>{claim.state === "upheld" ? "Upheld" : "Dismissed"}</StatusPill>
                <span>{claim.residentName} · {currency.format(claim.amount)}{claim.correctionInvoiceNumber ? ` → ${claim.correctionInvoiceNumber}` : ""}{claim.resolutionNote ? ` · ${claim.resolutionNote}` : ""}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {claimFor && (
        <div className="setup-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setClaimFor(null)}>
          <section className="setup-dialog cash-dialog" role="dialog" aria-modal="true" aria-labelledby="claim-dialog-title">
            <header>
              <div>
                <span className="eyebrow">Raise a claim</span>
                <h2 id="claim-dialog-title">{claimFor.residentName} · {currency.format(claimFor.amount)}</h2>
                <p>The payment and receipt {claimFor.receiptNumber ?? ""} stay unchanged. The owner decides whether to add a correction due.</p>
              </div>
            </header>
            <form className="modal-form" onSubmit={raise}>
              <label>What went wrong?
                <textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. UTR not found in the bank statement" />
              </label>
              <button className="button button-primary button-full" type="submit" disabled={busy}>{busy ? "Raising…" : "Raise claim"}</button>
              <button className="button button-quiet button-full" type="button" disabled={busy} onClick={() => setClaimFor(null)}>Cancel</button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

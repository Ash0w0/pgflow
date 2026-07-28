"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Banknote, CalendarDays, CheckCircle2, CircleAlert, Copy, FileText, IndianRupee, MessageCircle, QrCode, Share2, ShieldCheck, Sparkles, WalletCards, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { CollectionsData } from "@/lib/collections-types";
import { AppShell } from "./app-shell";
import { WhatsAppSendModal, type WhatsAppSendTarget } from "./whatsapp-send-modal";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function displayDate(value: string) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(timestamp)
    : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function CollectionsWorkspace({ data, canGenerate, canReview }: { data: CollectionsData; canGenerate: boolean; canReview: boolean }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const payableInvoices = data.invoices.filter((invoice) => ["issued", "partially_paid", "overdue"].includes(invoice.state) && invoice.totalAmount > invoice.paidAmount);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashInvoiceId, setCashInvoiceId] = useState(payableInvoices[0]?.id ?? "");
  const selectedCashInvoice = payableInvoices.find(invoice => invoice.id === cashInvoiceId);
  const [cashAmount, setCashAmount] = useState(String(selectedCashInvoice ? selectedCashInvoice.totalAmount - selectedCashInvoice.paidAmount : ""));
  const [cashNote, setCashNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("more_information_needed");
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);
  const [shareData, setShareData] = useState<null | { url: string; expiresAt: string; invoiceNumber: string; residentName: string; residentPhone: string; amount: number }>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [whatsappTarget, setWhatsappTarget] = useState<WhatsAppSendTarget | null>(null);
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);

  function triggerWhatsAppModal(invoice: CollectionsData["invoices"][number]) {
    setWhatsappTarget({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      recipientName: invoice.residentName,
      stage: invoice.state === "overdue" ? "t+2" : "due",
    });
    setWhatsappModalOpen(true);
  }

  async function generateInvoices() {
    if (!confirmed || submitting || data.totals.readyToGenerateCount === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/billing/generate-monthly", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: data.period, confirmGeneration: true }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === "string"
          ? result.error
          : "The invoices could not be generated.");
      }
      const generation = isRecord(result) && isRecord(result.result) ? result.result : null;
      const count = generation && typeof generation.generatedCount === "number"
        ? generation.generatedCount
        : data.totals.readyToGenerateCount;
      setSuccess(`${count} ${count === 1 ? "invoice" : "invoices"} generated for ${data.periodLabel}.`);
      setConfirmed(false);
      router.refresh();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "The invoices could not be generated.");
    } finally {
      setSubmitting(false);
    }
  }

  async function recordCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting) return; setSubmitting(true); setError(null); setSuccess(null);
    try {
      const response = await fetch("/api/payments/cash", { method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({invoiceId:cashInvoiceId,amount:Number(cashAmount),collectedAt:new Date().toISOString(),note:cashNote}) });
      const result: unknown = await response.json().catch(()=>null);
      if (!response.ok) throw new Error(isRecord(result)&&typeof result.error==="string"?result.error:"Cash could not be recorded.");
      setCashOpen(false); setSuccess("Cash was recorded with the receiving staff identity and processed under the property approval rule."); router.refresh();
    } catch(caught) { setError(caught instanceof Error?caught.message:"Cash could not be recorded."); } finally { setSubmitting(false); }
  }

  async function reviewPayment(paymentId: string, decision: "approve"|"reject") {
    if (submitting) return; setSubmitting(true); setError(null); setSuccess(null);
    try {
      const response=await fetch("/api/payments/review",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({paymentId,decision,reason:decision==="reject"?rejectionReason:""})});
      const result:unknown=await response.json().catch(()=>null); if(!response.ok)throw new Error(isRecord(result)&&typeof result.error==="string"?result.error:"Review did not complete.");
      setSuccess(decision==="approve"?"Payment approved, allocated and receipted.":"Payment rejected with a recorded reason."); router.refresh();
    } catch(caught){setError(caught instanceof Error?caught.message:"Review did not complete.");} finally{setSubmitting(false);}
  }

  async function createPaymentLink(invoice: CollectionsData["invoices"][number]) {
    if (submitting || !data.upiConfigured) return;
    setSubmitting(true);
    setSharingInvoiceId(invoice.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/payment-requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(result) || typeof result.url !== "string" || typeof result.expiresAt !== "string") {
        throw new Error(isRecord(result) && typeof result.error === "string"
          ? result.error
          : "The secure payment link could not be created.");
      }
      setShareData({
        url: result.url,
        expiresAt: result.expiresAt,
        invoiceNumber: invoice.number,
        residentName: invoice.residentName,
        residentPhone: invoice.residentPhone,
        amount: invoice.totalAmount - invoice.paidAmount,
      });
      setShareCopied(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The secure payment link could not be created.");
    } finally {
      setSubmitting(false);
      setSharingInvoiceId(null);
    }
  }

  return (
    <AppShell demoMode={false}>
      <div className="page-stack collections-page">
        <section className="page-heading collections-heading">
          <div>
            <div className="demo-kicker"><Sparkles size={14} /> Rent ledger</div>
            <h1>Collections</h1>
            <p>Generate monthly rent, track balances, and manage payments.</p>
          </div>
          <div className="billing-period-chip"><CalendarDays size={17} /><span><small>Billing period</small><strong>{data.periodLabel}</strong></span></div>
        </section>

        {success && <div className="setup-feedback success" role="status"><CheckCircle2 size={17} />{success}</div>}
        {error && <div className="setup-feedback error" role="alert"><CircleAlert size={17} />{error}</div>}

        <section className="workspace-stat-grid" aria-label="Collection summary">
          <article className="metric-card"><span className="eyebrow">Total billed</span><strong>{currency.format(data.totals.totalBilled)}</strong><p>{data.totals.invoiceCount} issued invoices</p></article>
          <article className="metric-card"><span className="eyebrow">Collected</span><strong>{currency.format(data.totals.totalCollected)}</strong><p>Approved payments only</p></article>
          <article className="metric-card"><span className="eyebrow">Outstanding</span><strong>{currency.format(data.totals.totalOutstanding)}</strong><p>{data.totals.overdueCount} overdue</p></article>
          <article className="metric-card"><span className="eyebrow">Ready this month</span><strong>{data.totals.readyToGenerateCount}</strong><p>{currency.format(data.totals.readyToGenerateTotal)} previewed</p></article>
        </section>

        <section className="panel billing-generation-panel">
          <header className="panel-head">
            <div><span className="eyebrow">Generation</span><h2>{data.periodLabel} rent preview</h2></div>
            <span className="billing-safety-badge"><ShieldCheck size={16} /> Duplicate-safe</span>
          </header>

          {data.preview.length === 0 ? (
            <div className="collections-empty"><WalletCards size={25} /><div><strong>No active residents to bill</strong><p>Onboard a resident before generating rent.</p></div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table billing-preview-table">
                <thead><tr><th>Resident</th><th>Bed</th><th>Rent</th><th>Result</th></tr></thead>
                <tbody>{data.preview.map((row) => (
                  <tr key={row.tenantId}>
                    <td><strong>{row.residentName}</strong></td>
                    <td>{row.roomLabel}</td>
                    <td><strong>{currency.format(row.rent)}</strong></td>
                    <td><span className={`invoice-state ${row.alreadyIssued ? "paid" : "issued"}`}>{row.alreadyIssued ? "Already issued" : "Will generate"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div className="billing-generation-actions">
            <label className="billing-confirmation">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!canGenerate || data.totals.readyToGenerateCount === 0 || submitting} />
              <span><strong>I reviewed the residents and rent amounts.</strong><small>This creates invoices but does not record payments.</small></span>
            </label>
            <button className="button button-primary" type="button" onClick={generateInvoices} disabled={!canGenerate || !confirmed || data.totals.readyToGenerateCount === 0 || submitting}>
              <FileText size={17} />{submitting ? "Generating safely…" : `Generate ${data.totals.readyToGenerateCount || ""} ${data.totals.readyToGenerateCount === 1 ? "invoice" : "invoices"}`.trim()}
            </button>
          </div>
          {!canGenerate && <p className="billing-role-note">Only the owner can generate invoices.</p>}
        </section>

        <section className="panel invoice-register-panel">
          <header className="panel-head"><div><span className="eyebrow">Ledger</span><h2>Invoice register</h2></div><span className="resident-count"><Banknote size={16} /> {data.invoices.length} total</span></header>
          {data.invoices.length === 0 ? (
            <div className="collections-empty"><IndianRupee size={25} /><div><strong>No invoices yet</strong><p>The first monthly generation will appear here immediately.</p></div></div>
          ) : (
            <div className="table-wrap">
              <table className="data-table invoice-table">
                <thead><tr><th>Invoice</th><th>Resident</th><th>Due</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td><strong>{invoice.number}</strong><small>{invoice.period === "opening" ? "Opening balance" : invoice.period}</small></td>
                    <td><strong>{invoice.residentName}</strong><small>{invoice.roomLabel}</small></td>
                    <td>{displayDate(invoice.dueDate)}</td>
                    <td><strong>{currency.format(invoice.totalAmount)}</strong></td>
                    <td className="amount-clear">{currency.format(invoice.paidAmount)}</td>
                    <td className={invoice.totalAmount > invoice.paidAmount ? "amount-due" : "amount-clear"}><strong>{currency.format(invoice.totalAmount - invoice.paidAmount)}</strong></td>
                    <td><span className={`invoice-state ${invoice.state}`}>{invoice.state.replace("_", " ")}</span></td>
                    <td>
                      <div className="invoice-actions">
                        {["issued","partially_paid","overdue"].includes(invoice.state)&&(
                          <>
                            <button
                              type="button"
                              className="resident-manage-button"
                              style={{ color: "#059669", borderColor: "#a7f3d0" }}
                              onClick={() => triggerWhatsAppModal(invoice)}
                              title="Queue an approved reminder for an activated resident"
                            >
                              <MessageCircle size={14} /> WhatsApp
                            </button>
                            <Link className={`resident-manage-button ${data.upiConfigured?"":"disabled"}`} aria-disabled={!data.upiConfigured} href={data.upiConfigured?`/pay/${invoice.id}`:"/settings"}>
                              <QrCode size={14}/>{data.upiConfigured?"Preview UPI":"Set up UPI"}
                            </Link>
                            {data.upiConfigured&&(
                              <button className="resident-manage-button" type="button" disabled={submitting} onClick={()=>createPaymentLink(invoice)}>
                                <Share2 size={14}/>{sharingInvoiceId===invoice.id?"Creating…":"Share"}
                              </button>
                            )}
                            <button className="resident-manage-button" type="button" onClick={()=>{setCashInvoiceId(invoice.id);setCashAmount(String(invoice.totalAmount-invoice.paidAmount));setCashOpen(true);}}>
                              <Banknote size={14}/>Cash
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel invoice-register-panel">
          <header className="panel-head"><div><span className="eyebrow">Verification</span><h2>Pending reviews</h2></div><span className="resident-count">{data.pendingPayments.length} pending</span></header>
          {data.pendingPayments.length===0?<div className="collections-empty"><ShieldCheck size={25}/><div><strong>Nothing waiting for review</strong><p>Submitted UPI evidence and approval-required cash will appear here.</p></div></div>:<div className="table-wrap"><table className="data-table"><thead><tr><th>Resident</th><th>Method</th><th>Reference</th><th>Amount</th><th>Actions</th></tr></thead><tbody>{data.pendingPayments.map(payment=><tr key={payment.id}><td><strong>{payment.residentName}</strong></td><td>{payment.method.toUpperCase()}</td><td>{payment.reference}</td><td><strong>{currency.format(payment.amount)}</strong></td><td><div className="payment-review-actions"><select aria-label={`Rejection reason for ${payment.residentName}`} value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} disabled={!canReview||submitting}><option value="more_information_needed">More information needed</option><option value="amount_not_received">Amount not received</option><option value="incorrect_amount">Incorrect amount</option><option value="duplicate_utr">Duplicate UTR</option><option value="invalid_screenshot">Invalid screenshot</option><option value="wrong_account">Wrong account</option></select><div className="invoice-actions"><button type="button" className="resident-manage-button" disabled={!canReview||submitting} onClick={()=>reviewPayment(payment.id,"approve")}>Approve</button><button type="button" className="resident-manage-button danger" disabled={!canReview||submitting} onClick={()=>reviewPayment(payment.id,"reject")}>Reject</button></div></div></td></tr>)}</tbody></table></div>}
        </section>
      </div>

      {whatsappModalOpen && (
        <WhatsAppSendModal
          isOpen={whatsappModalOpen}
          target={whatsappTarget}
          onClose={() => setWhatsappModalOpen(false)}
          onSuccess={() => {
            setSuccess("WhatsApp reminder queued. PGFlow will deliver it through the approved template.");
            router.refresh();
          }}
        />
      )}

      {shareData&&<div className="setup-dialog-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&setShareData(null)}><section className="setup-dialog cash-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-share-title"><header><div><span className="eyebrow">Seven-day secure link</span><h2 id="payment-share-title">Share {shareData.invoiceNumber}</h2><p>Use this only as an app-managed fallback. Normal reminders are queued through the approved WhatsApp template.</p></div><button autoFocus className="icon-button" type="button" onClick={()=>setShareData(null)} aria-label="Close payment-link sharing"><X size={19}/></button></header><div className="modal-form"><div className="password-security-note"><ShieldCheck size={17}/><span>This link is unique to {shareData.residentName}.</span></div><label>Secure payment link<input value={shareData.url} readOnly onFocus={event=>event.currentTarget.select()}/></label><button className="button button-secondary button-full" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(shareData.url);setShareCopied(true);}catch{setError("The browser could not copy the link. Select it manually instead.");}}}><Copy size={17}/>{shareCopied?"Link copied":"Copy secure link"}</button><small>PGFlow never inserts this link into an unapproved free-form message.</small></div></section></div>}
      {cashOpen&&<div className="setup-dialog-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!submitting&&setCashOpen(false)}><section className="setup-dialog cash-dialog" role="dialog" aria-modal="true" aria-labelledby="cash-dialog-title"><header><div><span className="eyebrow">Staff-collected payment</span><h2 id="cash-dialog-title">Record cash</h2></div><button className="icon-button" type="button" onClick={()=>setCashOpen(false)} disabled={submitting} aria-label="Close cash form"><X size={19}/></button></header><form className="modal-form" onSubmit={recordCash}><label>Invoice<select value={cashInvoiceId} onChange={e=>{setCashInvoiceId(e.target.value);const invoice=payableInvoices.find(x=>x.id===e.target.value);setCashAmount(String(invoice?invoice.totalAmount-invoice.paidAmount:""));}}>{payableInvoices.map(invoice=><option value={invoice.id} key={invoice.id}>{invoice.number} · {invoice.residentName}</option>)}</select></label><label>Amount received<input type="number" min="1" max={selectedCashInvoice?selectedCashInvoice.totalAmount-selectedCashInvoice.paidAmount:10000000} value={cashAmount} onChange={e=>setCashAmount(e.target.value)} required/></label><label>Collection note<input value={cashNote} onChange={e=>setCashNote(e.target.value)} maxLength={500} placeholder="Received at front desk"/></label><div className="password-security-note"><ShieldCheck size={17}/><span>Your account will be recorded as the receiver.</span></div><button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting?"Recording safely…":"Record cash payment"}</button></form></section></div>}
    </AppShell>
  );
}

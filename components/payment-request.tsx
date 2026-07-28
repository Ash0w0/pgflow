"use client";

import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, Info, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { LivePaymentRequest } from "@/lib/payment-request-data";
import { BrandMark, PoweredBy } from "./brand-mark";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function PaymentRequest({
  data,
  accessToken = null,
  invalidPublicLink = false,
}: {
  data: LivePaymentRequest | null;
  accessToken?: string | null;
  invalidPublicLink?: boolean;
}) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!data) return;
    let active = true;
    QRCode.toDataURL(data.upiUri, {
      width: 360,
      margin: 1,
      color: { dark: "#123d32", light: "#ffffff" },
    }).then((value) => active && setQr(value)).catch(() => active && setQr(""));
    return () => { active = false; };
  }, [data]);

  if (!data) {
    return (
      <div className="payment-page">
        <main className="payment-card">
          <div className="demo-warning">
            <Info size={17} />
            <span>
              {invalidPublicLink
                ? "This payment link is invalid, expired, replaced, or already used. Ask the PG team for a fresh link."
                : "The fictional demo never emits a real UPI destination."}
            </span>
          </div>
        </main>
      </div>
    );
  }

  if (data.journeyState === "under_review" || data.journeyState === "approved") {
    const approved = data.journeyState === "approved";
    return (
      <div className="payment-page">
        <header className="payment-nav">
          <BrandMark />
          <span><ShieldCheck size={15} />Secure PG payment status</span>
        </header>
        <main className="payment-card">
          <div className="payment-title">
            <span className="demo-kicker">{data.invoiceNumber} · {data.period}</span>
            <h1>{approved ? "Payment approved" : "Proof under review"}</h1>
            <p>{approved
              ? "The PG approved this payment and created an immutable receipt."
              : "The PG team must verify the bank or UPI account before this invoice is marked paid."}</p>
          </div>
          <div className="live-operator-feedback feedback-success" role="status">
            <CheckCircle2 size={18} />
            <span>{approved
              ? `Receipt ${data.receiptNumber ?? "issued"} is available from the secure link sent on WhatsApp.`
              : "No further submission is needed. This secure page remains available while the proof is reviewed."}</span>
          </div>
        </main>
        <footer className="payment-footer"><PoweredBy /></footer>
      </div>
    );
  }

  async function submitProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("invoiceId", data.invoiceId);
      if (accessToken) form.set("token", accessToken);
      const upload = await fetch("/api/uploads/payment-evidence", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const uploaded: unknown = await upload.json().catch(() => null);
      if (!upload.ok || !isRecord(uploaded)) {
        throw new Error(isRecord(uploaded) && typeof uploaded.error === "string"
          ? uploaded.error
          : "Screenshot upload failed.");
      }

      const response = await fetch("/api/payments/evidence", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoiceId: data.invoiceId,
          amount: data.amount,
          utr,
          paidAt: `${paidAt}T12:00:00+05:30`,
          objectKey: uploaded.objectKey,
          contentType: uploaded.contentType,
          fileHash: uploaded.hash,
          note,
          ...(accessToken ? { token: accessToken } : {}),
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(result) && typeof result.error === "string"
          ? result.error
          : "Evidence submission failed.");
      }
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evidence submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="payment-page">
      <header className="payment-nav">
        <BrandMark />
        <span><ShieldCheck size={15} />{accessToken ? "Secure PG payment link" : "Direct to PG UPI"}</span>
      </header>
      <main className="payment-card">
        {!accessToken && <Link className="back-link" href="/collections"><ArrowLeft size={16} />Back to Collections</Link>}
        <div className="payment-title">
          <span className="demo-kicker">{data.invoiceNumber} · {data.period}</span>
          <h1>Pay {data.pgName}</h1>
          <p>Open your UPI app or scan the QR. PGFlow does not receive or hold the money.</p>
        </div>
        <section className="payment-amount">
          <small>Outstanding amount</small>
          <strong>{currency.format(data.amount)}</strong>
          <span>{data.residentName} · exact invoice balance</span>
        </section>
        <section className="qr-section">
          <div className="qr-frame">
            {qr
              ? <Image unoptimized width={360} height={360} src={qr} alt={`Invoice-specific UPI QR to pay ${data.payeeName}`} />
              : <span className="qr-loading">Generating secure QR…</span>}
          </div>
          <div>
            <span className="eyebrow">Recommended · exact invoice QR</span>
            <h2>{data.payeeName}</h2>
            <p><code>{data.upiId}</code></p>
            <p><code>{data.reference}</code></p>
            <button
              className="button button-quiet"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard?.writeText(data.upiId);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <Copy size={16} />{copied ? "Copied" : "Copy UPI ID"}
            </button>
          </div>
        </section>
        {data.uploadedQrUrl && (
          <section className="uploaded-upi-qr">
            <Image unoptimized width={240} height={240} src={data.uploadedQrUrl} alt={`${data.pgName} owner-uploaded UPI QR`} />
            <div>
              <span className="eyebrow">PG’s existing QR · alternative</span>
              <h2>Scan the owner-uploaded QR</h2>
              <p>This QR may not prefill the invoice amount or reference. Enter exactly <strong>{currency.format(data.amount)}</strong> and use <code>{data.reference}</code>.</p>
            </div>
          </section>
        )}
        <a className="button button-primary button-full" href={data.upiUri}>Open a UPI app <ExternalLink size={17} /></a>
        <div className="demo-warning">
          <Info size={17} />
          <span><strong>Payment is not automatically verified.</strong> After paying, submit the bank UTR and screenshot below. Staff must check the PG bank account.</span>
        </div>
        {data.journeyState === "rejected" && (
          <div className="live-operator-feedback feedback-error" role="alert">
            <Info size={17} />
            <span>Your previous proof was rejected: {data.rejectionReason || "more information is needed"}. Submit corrected proof below.</span>
          </div>
        )}
        {complete ? (
          <div className="live-operator-feedback feedback-success" role="status">
            <CheckCircle2 size={17} />
            <span>Evidence submitted for manual review. The invoice is still unpaid until approval.</span>
          </div>
        ) : (
          <form className="modal-form payment-proof-form" onSubmit={submitProof}>
            <h2>Submit payment proof</h2>
            <div className="form-row">
              <label>UTR / bank reference<input value={utr} onChange={(event) => setUtr(event.target.value)} minLength={8} maxLength={35} required /></label>
              <label>Payment date<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required /></label>
            </div>
            <label>Screenshot<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
            <label>Optional note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-secondary button-full" type="submit" disabled={!file || submitting}>
              <Upload size={16} />{submitting ? "Submitting securely…" : "Submit proof for review"}
            </button>
          </form>
        )}
      </main>
      <footer className="payment-footer"><PoweredBy /></footer>
    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Info, ShieldCheck, Upload } from "lucide-react";
import { BrandMark, PoweredBy } from "./brand-mark";

export function PaymentRequest({ invoiceId }: { invoiceId: string }) {
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const simulationToken = useMemo(() => `PGFLOW-DEMO-NOT-A-PAYMENT:${invoiceId}`, [invoiceId]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(simulationToken, { width: 360, margin: 1, color: { dark: "#123d32", light: "#ffffff" } })
      .then((value) => active && setQr(value))
      .catch(() => active && setQr(""));
    return () => { active = false; };
  }, [simulationToken]);

  return (
    <div className="payment-page">
      <header className="payment-nav"><BrandMark /><span><ShieldCheck size={15} /> Simulated payment request</span></header>
      <main className="payment-card">
        <Link className="back-link" href="/tenant"><ArrowLeft size={16} /> Back to tenant home</Link>
        <div className="payment-title"><span className="demo-kicker">Fictional invoice · {invoiceId}</span><h1>Pay Nivasa Demo House</h1><p>This screen demonstrates a direct UPI request. No funds can be transferred from the demo.</p></div>
        <section className="payment-amount"><small>Total due</small><strong>₹8,500</strong><span>July rent ₹8,200 · Electricity ₹300</span></section>
        <section className="qr-section">
          <div className="qr-frame">{qr ? <Image unoptimized width={360} height={360} src={qr} alt="Non-payment demonstration QR" /> : <span className="qr-loading">Generating demo marker…</span>}<b>DEMO</b></div>
          <div><span className="eyebrow">Illustrative payee</span><h2>Nivasa Demo House</h2><p><code>not-a-real-vpa</code></p><button className="button button-quiet" type="button" onClick={async () => { try { await navigator.clipboard?.writeText("not-a-real-vpa"); setCopied(true); } catch { setCopied(false); } }}><Copy size={16} /> {copied ? "Copied" : "Copy demo label"}</button></div>
        </section>
        <button className="button button-primary button-full demo-disabled-link" type="button" disabled>Open a UPI app <ExternalLink size={17} /></button>
        <div className="demo-warning"><Info size={17} /><span><strong>Demo safety is active.</strong> No UPI URI or VPA is emitted. Scanning the marker only returns a non-payment demo token.</span></div>
        <div className="payment-next"><span><Check size={17} /></span><div><strong>Already paid outside the app?</strong><p>Submit the amount, UTR and screenshot. Nivasa will verify the bank credit manually.</p></div><Link className="button button-secondary" href="/tenant"><Upload size={16} /> Submit proof</Link></div>
      </main>
      <footer className="payment-footer"><PoweredBy /></footer>
    </div>
  );
}

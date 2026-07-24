"use client";

import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRight,
  Bell,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  FileText,
  Headphones,
  History,
  Home,
  Languages,
  LogOut,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Upload,
  UserRound,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark, PoweredBy } from "./brand-mark";
import { StatusPill } from "./status-pill";

export function TenantApp() {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [proofOpen, setProofOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "hi" ? "hi" : "en";
    return () => { document.documentElement.lang = "en"; };
  }, [language]);

  useEffect(() => {
    if (!proofOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProofOpen(false);
        setSubmitted(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [proofOpen]);

  function openProofPreview() {
    setSubmitted(false);
    setProofOpen(true);
  }

  function closeProofPreview() {
    setProofOpen(false);
    setSubmitted(false);
  }

  const copy = language === "en"
    ? {
        greeting: "Hi, Mira",
        subtitle: "Everything at your PG, in one place.",
        due: "Current amount due",
        pay: "Pay with UPI",
        proof: "Submit payment proof",
        complaint: "Raise a complaint",
        moveout: "Request move-out",
      }
    : {
        greeting: "नमस्ते, मीरा",
        subtitle: "निवासा की सभी सेवाएँ, एक ही जगह।",
        due: "वर्तमान बकाया",
        pay: "UPI से भुगतान करें",
        proof: "भुगतान प्रमाण भेजें",
        complaint: "शिकायत दर्ज करें",
        moveout: "मूव-आउट अनुरोध",
      };

  return (
    <MotionConfig reducedMotion="user"><div className="tenant-shell">
      <header className="tenant-header">
        <BrandMark />
        <div className="tenant-header-actions">
          <button className="language-button" type="button" onClick={() => setLanguage(language === "en" ? "hi" : "en")}><Languages size={16} /> {language === "en" ? "हिंदी" : "EN"}</button>
          <button className="icon-button" type="button" aria-label="Notifications"><Bell size={19} /><span className="tenant-notification-dot" /></button>
          <span className="avatar avatar-olive">MK</span>
        </div>
      </header>

      <main className="tenant-main">
        <section className="tenant-greeting">
          <div><span className="demo-kicker">Fictional tenant account</span><h1>{copy.greeting}</h1><p>{copy.subtitle}</p></div>
          <Link className="text-button" href="/"><ArrowRight size={16} /> Staff demo</Link>
        </section>

        <section className="tenant-balance-card">
          <div className="balance-top">
            <span>{copy.due}</span>
            <StatusPill tone="warning">Due 20 Jul</StatusPill>
          </div>
          <strong>₹8,500</strong>
          <p>July rent ₹8,200 · Electricity ₹300</p>
          <div className="balance-progress"><span style={{ width: "0%" }} /></div>
          <div className="balance-actions">
            <Link className="button button-lime" href="/pay/INV-DEMO-0726"><WalletCards size={18} /> {copy.pay}</Link>
            <button className="button button-dark-ghost" type="button" onClick={openProofPreview}><Upload size={17} /> {copy.proof}</button>
          </div>
          <small className="demo-payment-note"><ShieldCheck size={15} /> Demo only — no money can be transferred.</small>
        </section>

        <section className="tenant-quick-grid">
          <button type="button"><span className="quick-icon quick-peach"><Wrench size={20} /></span><strong>{copy.complaint}</strong><small>Photo or message</small><ChevronRight size={18} /></button>
          <button type="button"><span className="quick-icon quick-blue"><LogOut size={20} /></span><strong>{copy.moveout}</strong><small>30-day notice applies</small><ChevronRight size={18} /></button>
          <button type="button"><span className="quick-icon quick-lime"><ReceiptText size={20} /></span><strong>Receipts</strong><small>6 available</small><ChevronRight size={18} /></button>
        </section>

        <section className="tenant-grid">
          <article className="tenant-card" id="payment-history">
            <div className="panel-head"><div><span className="eyebrow">Payment history</span><h2>Recent activity</h2></div><button className="text-button" type="button">View all</button></div>
            <div className="tenant-payment-list">
              <div><span className="payment-history-icon"><CircleCheckBig size={19} /></span><span><strong>June rent</strong><small>UPI · DEMO118294</small></span><span><strong>₹8,200</strong><small>Paid 4 Jun</small></span></div>
              <div><span className="payment-history-icon"><CircleCheckBig size={19} /></span><span><strong>May rent + electricity</strong><small>Cash · RCPT-00642</small></span><span><strong>₹8,480</strong><small>Paid 2 May</small></span></div>
              <div><span className="payment-history-icon pending"><Clock3 size={19} /></span><span><strong>July rent</strong><small>Payment proof submitted</small></span><span><strong>₹8,500</strong><small>In review</small></span></div>
            </div>
          </article>

          <article className="tenant-card tenant-notice-card">
            <div className="notice-icon"><MessageSquareText size={20} /></div>
            <span className="eyebrow">Property notice</span>
            <h2>Water supply maintenance</h2>
            <p>Water supply will pause tomorrow from 11 AM to 1 PM for scheduled maintenance.</p>
            <small>Posted 2 hours ago · English & Hindi</small>
          </article>
        </section>

        <section className="tenant-grid tenant-grid-secondary">
          <article className="tenant-card" id="complaint">
            <div className="panel-head"><div><span className="eyebrow">Complaint</span><h2>Wi-Fi drops after 9 PM</h2></div><StatusPill tone="info">In progress</StatusPill></div>
            <div className="ticket-progress"><span className="done" /><span className="done" /><span className="active" /><span /></div>
            <div className="ticket-labels"><span>Raised</span><span>Assigned</span><span>Repairing</span><span>Resolved</span></div>
            <p className="tenant-card-note">Rohan from the property team is checking the floor router today.</p>
          </article>
          <article className="tenant-card tenant-support-card" id="support">
            <Headphones size={25} />
            <div><span className="eyebrow">Need help?</span><h2>Talk to the property team</h2><p>Replies usually arrive within 20 minutes.</p></div>
            <button className="button button-secondary" type="button" disabled>WhatsApp disabled in demo</button>
          </article>
        </section>
      </main>

      <nav className="tenant-bottom-nav" aria-label="Tenant navigation">
        <Link className="active" href="/tenant"><Home size={20} /><span>Home</span></Link>
        <Link href="#payment-history"><History size={20} /><span>Payments</span></Link>
        <Link href="#support"><MessageSquareText size={20} /><span>Help</span></Link>
        <Link href="#complaint"><FileText size={20} /><span>Documents</span></Link>
        <Link href="/login"><UserRound size={20} /><span>Profile</span></Link>
      </nav>
      <footer className="tenant-footer"><PoweredBy /></footer>

      <AnimatePresence>
        {proofOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && closeProofPreview()}>
            <motion.section className="modal-card proof-modal" role="dialog" aria-modal="true" aria-labelledby="proof-preview-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
              <div className="modal-head"><div><span className="eyebrow">UPI evidence simulation</span><h2 id="proof-preview-title">{submitted ? "Preview complete" : "Tell us about your payment"}</h2><p>{submitted ? "No record was created. A live PG would review its bank credit before issuing a receipt." : "A screenshot and UTR are evidence only. They never mark rent as paid automatically."}</p></div><button autoFocus aria-label="Close payment-proof preview" className="icon-button" type="button" onClick={closeProofPreview}><X size={19} /></button></div>
              {submitted ? (
                <div className="success-state"><span><CircleCheckBig size={30} /></span><h3>Simulation complete</h3><p>Reference DEMO48291073 · ₹8,500</p><StatusPill tone="info">Not submitted</StatusPill><button className="button button-primary button-full" type="button" onClick={closeProofPreview}>Done</button></div>
              ) : (
                <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
                  <div className="form-row"><label>Amount paid<input defaultValue="8500" inputMode="numeric" /></label><label>Payment date<input defaultValue="2026-07-17" type="date" /></label></div>
                  <label>UTR / reference<input defaultValue="DEMO48291073" /></label>
                  <label className="upload-field"><Upload size={20} /><strong>Choose a sample screenshot</strong><small>PNG, JPG or WebP · up to 5 MB in the live workflow</small><input type="file" accept="image/png,image/jpeg,image/webp" /></label>
                  <button className="button button-primary button-full" type="submit">Preview submission</button>
                </form>
              )}
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div></MotionConfig>
  );
}

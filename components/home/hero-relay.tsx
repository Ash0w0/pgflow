"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { BadgeCheck, CheckCheck, ImageIcon, Link2, Pause, Play, ReceiptText, ShieldCheck } from "lucide-react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const STEPS = [
  { label: "Reminder goes out", detail: "A WhatsApp message with a secure link to pay your UPI." },
  { label: "Resident pays you", detail: "Straight to your UPI ID. They share the screenshot and UTR." },
  { label: "You check the proof", detail: "Match it in your bank app, then approve. Nothing counts until you do." },
  { label: "Receipt goes back", detail: "The resident gets the receipt on WhatsApp. Your books update." },
] as const;

const STEP_MS = 3200;

const rise = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const },
};

type RowState = "due" | "review" | "paid";

function StatusTag({ state }: { state: RowState }) {
  const label = state === "paid" ? "Paid" : state === "review" ? "Check proof" : "Due";
  return <span className={`ph-tag ph-tag-${state}`}>{label}</span>;
}

export function HeroRelay() {
  const reduce = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const shown = reduce ? 3 : step;

  useEffect(() => {
    if (reduce || !playing) return;
    const timer = window.setTimeout(() => setStep((current) => (current + 1) % STEPS.length), step === 3 ? STEP_MS + 1600 : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, playing, reduce]);

  const row204: RowState = shown >= 3 ? "paid" : shown >= 1 ? "review" : "due";
  const collected = shown >= 3 ? 34 : 33;
  // The signal carries the proof to the owner, then the receipt back to the resident.
  const signal = shown === 0 ? 0 : shown === 3 ? 0 : 1;

  return (
    <div className="ph-relay-wrap">
      <p className="ph-sr">
        Animated example: PGFlow sends a resident a WhatsApp rent reminder with a secure link. The resident pays the PG&apos;s own UPI ID and shares proof.
        The owner checks the proof against their bank app and approves it. The resident then receives a receipt on WhatsApp and the owner&apos;s ledger marks Room 204 as paid.
      </p>

      <div className="ph-relay" aria-hidden="true" data-step={shown}>
        {/* Resident side: an ordinary WhatsApp chat */}
        <div className={`ph-phone ${shown === 0 || shown === 1 || shown === 3 ? "is-live" : ""}`}>
          <div className="ph-phone-bar">
            <span className="ph-avatar">P</span>
            <div><strong>Your PG</strong><small>via PGFlow · WhatsApp</small></div>
          </div>
          <div className="ph-chat">
            <span className="ph-chat-day">Today</span>
            <motion.div className="ph-bubble ph-in" {...rise}>
              Hi Rohit, your November rent of <b>₹8,500</b> is due on 5 Nov. Pay your PG directly by UPI:
              <span className="ph-link"><Link2 size={13} /> yourpg.pgflow.co/pay/…</span>
              <time>9:02 am</time>
            </motion.div>
            <AnimatePresence>
              {shown >= 1 && (
                <motion.div key="paid" className="ph-bubble ph-out" {...rise}>
                  <span className="ph-shot"><ImageIcon size={14} /> <span>UPI · ₹8,500 · UTR 4123 5678 9012</span></span>
                  Done bhaiya, screenshot upload kar diya
                  <time>9:14 am <CheckCheck size={13} /></time>
                </motion.div>
              )}
              {shown >= 3 && (
                <motion.div key="receipt" className="ph-bubble ph-in ph-receipt" {...rise}>
                  <ReceiptText size={15} /> Payment received. Receipt <b>RCP-2611-0042</b>
                  <span className="ph-link"><Link2 size={13} /> View receipt</span>
                  <time>9:20 am</time>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="ph-wire" style={{ ["--p" as string]: signal }}>
          <span className="ph-wire-dot" />
        </div>

        {/* Owner side: the PGFlow collections view */}
        <div className={`ph-console ${shown === 2 ? "is-live" : ""}`}>
          <div className="ph-console-head">
            <div><small>Collections · November</small><strong>{collected} of 40 paid</strong></div>
            <span className="ph-meter"><motion.span animate={{ width: `${(collected / 40) * 100}%` }} transition={{ duration: 0.8 }} /></span>
          </div>
          <ul className="ph-rows">
            <li><span>101</span><em>Aman</em><StatusTag state="paid" /></li>
            <li className={shown >= 1 && shown < 3 ? "is-focus" : ""}><span>204</span><em>Rohit</em><StatusTag state={row204} /></li>
            <li><span>118</span><em>Kabir</em><StatusTag state="paid" /></li>
            <li><span>305</span><em>Sana</em><StatusTag state="due" /></li>
          </ul>
          <AnimatePresence>
            {shown === 2 && (
              <motion.div key="review" className="ph-review" {...rise}>
                <div className="ph-review-head"><ShieldCheck size={16} /> Proof from Room 204 · ₹8,500</div>
                <ul>
                  <li><BadgeCheck size={14} /> Amount matches the invoice</li>
                  <li><BadgeCheck size={14} /> UTR …9012 not used before</li>
                  <li><BadgeCheck size={14} /> Seen in your bank app</li>
                </ul>
                <div className="ph-review-actions">
                  <span className="ph-btn-ghost">Reject</span>
                  <motion.span className="ph-btn-approve" initial={{ scale: 1 }} animate={reduce ? {} : { scale: [1, 1, 0.94, 1] }} transition={{ duration: 2.4, times: [0, 0.7, 0.8, 1] }}>Approve</motion.span>
                </div>
              </motion.div>
            )}
            {shown === 3 && (
              <motion.div key="done" className="ph-settled" {...rise}>
                <ReceiptText size={16} /> Receipt RCP-2611-0042 issued and sent. Audit entry saved.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="ph-steps" role="group" aria-label="Walk through the rent relay">
        {STEPS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className={`ph-step ${index === shown ? "is-active" : ""} ${index < shown ? "is-done" : ""}`}
            aria-pressed={index === shown}
            onClick={() => { setStep(index); setPlaying(false); }}
          >
            <span className="ph-step-n">{index + 1}</span>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            {index === shown && playing && !reduce && <span className="ph-step-timer" key={`t${step}`} />}
          </button>
        ))}
        {!reduce && (
          <button type="button" className="ph-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

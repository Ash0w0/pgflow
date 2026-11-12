"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, BellRing, Clock3, History, ImageIcon, Link2, ReceiptText, Scale, ShieldCheck, ToggleRight, XCircle } from "lucide-react";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const ACTS = [
  {
    n: "01",
    verb: "Send",
    title: "Rent day starts on WhatsApp, not on the phone.",
    body: "PGFlow sends each resident their rent with a secure link that opens straight to your UPI. Reminders go out 3 days before, on the due date, and 3 days after if it is still unpaid. Prefer to send them yourself? One tap opens the message for you to review.",
    points: ["Money goes to your UPI ID, never to PGFlow", "Each link works for one invoice for 7 days", "English or Hindi messages"],
  },
  {
    n: "02",
    verb: "Review",
    title: "A screenshot is a claim. You decide if it is true.",
    body: "When a resident uploads proof, it waits for you. You see the amount, the UTR and the screenshot side by side, check your bank app, and approve or reject with a reason. A UTR or screenshot that was already used is refused before it reaches you.",
    points: ["Nothing is marked paid until you approve", "Your manager can record cash; you sign off", "Every rejection is recorded with a reason"],
  },
  {
    n: "03",
    verb: "Record",
    title: "Every approval leaves a receipt and a trail.",
    body: "Approving issues a numbered receipt and sends it to the resident on WhatsApp. The ledger, the room and the resident update together, and every action is logged with who did it and when. Approved something by mistake? Raise a claim; history is corrected, never erased.",
    points: ["Numbered receipts residents open from WhatsApp", "Full activity history for every rupee", "Mistakes fixed with a correction, not an eraser"],
  },
] as const;

function Screen({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="ph-screen">
        <div className="ph-screen-head"><BellRing size={16} /> Reminders &amp; receipts on WhatsApp</div>
        <div className="ph-toggle-row"><span>Automatic rent reminders</span><ToggleRight size={26} className="ph-on" /></div>
        <ol className="ph-timeline">
          <li><Clock3 size={14} /><span><b>2 Nov</b> 3 days before</span><em>Sent to 40</em></li>
          <li className="is-now"><Clock3 size={14} /><span><b>5 Nov</b> Due today</span><em>Sending to 7</em></li>
          <li><Clock3 size={14} /><span><b>8 Nov</b> 3 days after</span><em>Only if unpaid</em></li>
        </ol>
        <div className="ph-mini-bubble"><Link2 size={13} /> yourpg.pgflow.co/pay/… <small>valid 7 days</small></div>
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="ph-screen">
        <div className="ph-screen-head"><ShieldCheck size={16} /> Proof to review · Room 118</div>
        <div className="ph-proof">
          <div className="ph-proof-shot"><ImageIcon size={22} /><span>Payment successful</span><b>₹9,000</b><small>UTR 3109 8822 4417</small></div>
          <dl>
            <div><dt>Invoice</dt><dd>₹9,000 · November</dd></div>
            <div><dt>UTR</dt><dd>…4417 <span className="ph-ok">new</span></dd></div>
            <div><dt>Paid at</dt><dd>5 Nov, 8:41 pm</dd></div>
          </dl>
        </div>
        <div className="ph-review-actions ph-review-actions-lg">
          <span className="ph-btn-ghost"><XCircle size={15} /> Reject with reason</span>
          <span className="ph-btn-approve"><BadgeCheck size={15} /> Approve</span>
        </div>
        <small className="ph-screen-foot">Check the credit in your bank app first. PGFlow never approves a screenshot for you.</small>
      </div>
    );
  }
  return (
    <div className="ph-screen">
      <div className="ph-screen-head"><ReceiptText size={16} /> Receipt RCP-2611-0057</div>
      <div className="ph-receipt-card">
        <div><span>Received from</span><b>Kabir · Room 118, Bed 2</b></div>
        <div><span>For</span><b>November rent</b></div>
        <div className="ph-receipt-amount"><span>Amount</span><b>₹9,000</b></div>
      </div>
      <ol className="ph-audit">
        <li><History size={13} /> 8:41 pm · Proof uploaded by resident</li>
        <li><History size={13} /> 9:05 pm · Approved by you</li>
        <li><History size={13} /> 9:05 pm · Receipt sent on WhatsApp</li>
      </ol>
      <div className="ph-claim"><Scale size={14} /> Approved by mistake? Raise a claim; a correction is added, history stays.</div>
    </div>
  );
}

function Act({ index, onActive, children }: { index: number; onActive: (index: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.55 });
  useEffect(() => { if (inView) onActive(index); }, [inView, index, onActive]);
  return <div ref={ref} className="ph-act">{children}</div>;
}

export function HowItWorks() {
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  return (
    <section className="ph-how" id="how-it-works" aria-labelledby="how-title">
      <div className="ph-container">
        <div className="ph-section-intro">
          <p className="ph-overline">How it works</p>
          <h2 id="how-title" className="ph-h2">Three moves. <em>Every month, the same calm way.</em></h2>
        </div>
        <div className="ph-how-grid">
          <div className="ph-acts">
            {ACTS.map((act, index) => (
              <Act key={act.n} index={index} onActive={setActive}>
                <span className="ph-act-n">{act.n}<i>{act.verb}</i></span>
                <h3>{act.title}</h3>
                <p>{act.body}</p>
                <ul>{act.points.map((point) => <li key={point}><BadgeCheck size={16} /> {point}</li>)}</ul>
                <div className="ph-act-inline" aria-hidden="true"><Screen index={index} /></div>
              </Act>
            ))}
          </div>
          <div className="ph-how-panel" aria-hidden="true">
            <div className="ph-how-sticky">
              <div className="ph-how-progress">{ACTS.map((act, index) => <span key={act.n} className={index === active ? "is-active" : index < active ? "is-done" : ""}>{act.verb}</span>)}</div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduce ? false : { opacity: 0, y: 18, rotateX: 6 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Screen index={active} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

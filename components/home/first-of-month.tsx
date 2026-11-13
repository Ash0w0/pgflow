"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { BadgeCheck, CircleDashed, ShieldCheck } from "lucide-react";
import { useSectionProgress } from "./use-section-progress";
import { usePrefersReducedMotion } from "./use-reduced-motion";

const MESSAGES = [
  { text: "Bhaiya kal pakka de dunga", from: "Room 112", x: 6, y: 14, r: -4 },
  { text: "UPI fail ho gaya, phir se bhejun?", from: "Room 305", x: 58, y: 8, r: 3 },
  { text: "Cash Raju bhaiya ko diya tha", from: "Room 210", x: 64, y: 40, r: -2 },
  { text: "Screenshot bheja tha na sir 🙏", from: "Room 118", x: 4, y: 52, r: 2 },
  { text: "Sir 500 kam bheja, baaki next week", from: "Room 407", x: 34, y: 70, r: -3 },
  { text: "Did 305 pay or was that 306?", from: "Your manager", x: 40, y: 30, r: 1 },
  { text: "Deposit se adjust kar lo na", from: "Room 221", x: 70, y: 72, r: 4 },
] as const;

const BOARD = [
  { icon: BadgeCheck, tone: "paid", label: "Paid and receipted", count: 33, note: "Receipts sent on WhatsApp" },
  { icon: ShieldCheck, tone: "review", label: "Proof waiting for you", count: 3, note: "112, 118, 305 · check in your bank app" },
  { icon: CircleDashed, tone: "due", label: "Not paid yet", count: 4, note: "Reminders go out on the due date" },
] as const;

function Bubble({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const message = MESSAGES[index];
  const appear = 0.04 + index * 0.06;
  const opacity = useTransform(progress, [appear, appear + 0.05, 0.6, 0.72], [0, 1, 1, 0]);
  const scale = useTransform(progress, [appear, appear + 0.05, 0.6, 0.72], [0.85, 1, 1, 0.4]);
  const x = useTransform(progress, [0.6, 0.72], ["0%", `${(50 - message.x) * 1.4}%`]);
  const y = useTransform(progress, [0.6, 0.72], ["0%", `${(45 - message.y) * 1.4}%`]);
  return (
    <motion.div className="ph-chaos-bubble" style={{ left: `${message.x}%`, top: `${message.y}%`, rotate: message.r, opacity, scale, x, y }}>
      <small>{message.from}</small>
      {message.text}
    </motion.div>
  );
}

function Board({ style }: { style?: Record<string, unknown> }) {
  return (
    <motion.div className="ph-board" style={style}>
      <div className="ph-board-head"><span>Sample PG · 40 beds</span><strong>1 Nov, 9:00 pm</strong></div>
      {BOARD.map(({ icon: Icon, tone, label, count, note }) => (
        <div key={label} className={`ph-board-row ph-board-${tone}`}>
          <Icon size={20} />
          <div><strong>{label}</strong><small>{note}</small></div>
          <b>{count}</b>
        </div>
      ))}
      <p>No register to tally tonight.</p>
    </motion.div>
  );
}

export function FirstOfMonth() {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const scrollYProgress = useSectionProgress(ref);
  const chaosHeading = useTransform(scrollYProgress, [0.5, 0.58], [1, 0]);
  const chaosY = useTransform(scrollYProgress, [0.5, 0.58], [0, -24]);
  const calmHeading = useTransform(scrollYProgress, [0.6, 0.7], [0, 1]);
  const calmY = useTransform(scrollYProgress, [0.6, 0.7], [24, 0]);
  const boardOpacity = useTransform(scrollYProgress, [0.68, 0.8], [0, 1]);
  const boardScale = useTransform(scrollYProgress, [0.68, 0.8], [0.92, 1]);
  const calendarRotate = useTransform(scrollYProgress, [0, 0.6], [-6, 4]);

  if (reduce) {
    return (
      <section className="ph-month ph-month-static" aria-labelledby="month-title">
        <div className="ph-container ph-month-static-grid">
          <div>
            <p className="ph-overline ph-overline-light">The 1st of the month</p>
            <h2 id="month-title" className="ph-h2">You know this day. <em>PGFlow makes it quiet.</em></h2>
            <ul className="ph-month-list">
              {MESSAGES.map((message) => <li key={message.text}><small>{message.from}</small>{message.text}</li>)}
            </ul>
          </div>
          <Board />
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="ph-month" aria-labelledby="month-title">
      <p className="ph-sr">
        On rent day, owners juggle messages like &ldquo;Bhaiya kal pakka de dunga&rdquo;, cash handed to staff and unchecked screenshots.
        With PGFlow the same day becomes one board: residents who paid have receipts, three proofs wait for the owner, and the rest get reminders.
      </p>
      <div className="ph-month-sticky">
        <div className="ph-container ph-month-stage">
          <div className="ph-month-copy">
            <motion.div style={{ rotate: calendarRotate }} className="ph-calendar" aria-hidden="true">
              <span>Nov</span><strong>1</strong><small>Rent day</small>
            </motion.div>
            <div className="ph-month-headings">
              <motion.h2 id="month-title" className="ph-h2" style={{ opacity: chaosHeading, y: chaosY }}>
                You know this day.
                <span className="ph-month-sub">Forty residents, six ways to pay, one register, and a phone that won&apos;t stop.</span>
              </motion.h2>
              <motion.p className="ph-h2 ph-month-calm" style={{ opacity: calmHeading, y: calmY }} aria-hidden="true">
                <em>Same day, with PGFlow.</em>
                <span className="ph-month-sub">Everyone who paid has a receipt. Everyone who didn&apos;t has a reminder. You check three proofs and sleep.</span>
              </motion.p>
            </div>
          </div>
          <div className="ph-chaos" aria-hidden="true">
            {MESSAGES.map((message, index) => <Bubble key={message.text} index={index} progress={scrollYProgress} />)}
            <Board style={{ opacity: boardOpacity, scale: boardScale }} />
          </div>
        </div>
      </div>
    </section>
  );
}

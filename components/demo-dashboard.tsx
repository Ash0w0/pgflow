"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRight,
  Banknote,
  BedDouble,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  IndianRupee,
  MessageCircleMore,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRoundX,
  UsersRound,
  WalletCards,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  collectionSeries,
  complaints,
  overviewMetrics,
  paymentReviews as initialReviews,
  recentActivity,
  roomSummaries,
} from "@/lib/demo-data";
import type { PaymentReview } from "@/lib/types";
import { StatusPill } from "./status-pill";

const metricIcons = [WalletCards, IndianRupee, UsersRound, Wrench];

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function DashboardModal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <motion.section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">Quick action</span>
            <h2 id="modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <button autoFocus className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

export function DemoDashboard() {
  const [reviews, setReviews] = useState<PaymentReview[]>(initialReviews);
  const [modal, setModal] = useState<"cash" | "notice" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pending = reviews.filter((review) => review.state === "pending_review");
  const maxChart = useMemo(() => Math.max(...collectionSeries.map((item) => item.billed)), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setModal(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [modal]);

  function notify(message: string) {
    setToast(message);
  }

  function updateReview(id: string, state: "approved" | "rejected") {
    const review = reviews.find((item) => item.id === id);
    setReviews((current) => current.map((item) => (item.id === id ? { ...item, state } : item)));
    notify(`Preview only: ${review?.tenant ?? "payment"} marked ${state}. No ledger or receipt was changed.`);
  }

  return (
    <MotionConfig reducedMotion="user">
      <motion.div className="page-stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <section className="page-heading">
          <div>
            <div className="demo-kicker"><Sparkles size={14} /> Fictional demo environment</div>
            <h1>Good morning, Aarav.</h1>
            <p>Here is what needs attention at Nivasa today.</p>
          </div>
          <div className="heading-actions">
            <button className="button button-secondary" type="button" onClick={() => setModal("notice")}>
              <Send size={17} /> Send notice
            </button>
            <button className="button button-primary" type="button" onClick={() => setModal("cash")}>
              <Plus size={17} /> Record cash
            </button>
          </div>
        </section>

        <div className="demo-safety-strip"><ShieldCheck size={16} /><span><strong>Fictional UI simulation.</strong> Names, money, UTRs and actions below are synthetic; changes remain only in this browser view.</span></div>

        <section className="metric-grid" aria-label="Property metrics">
          {overviewMetrics.map((metric, index) => {
            const Icon = metricIcons[index];
            return (
              <motion.article
                className={`metric-card tone-${metric.tone}`}
                key={metric.label}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.25 }}
              >
                <div className="metric-head">
                  <span>{metric.label}</span>
                  <span className="metric-icon"><Icon size={18} /></span>
                </div>
                <strong>{metric.value}</strong>
                <p>{metric.detail}</p>
                <small>{metric.trend}</small>
              </motion.article>
            );
          })}
        </section>

        <section className="dashboard-grid dashboard-grid-top">
          <article className="panel collection-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Collections</span>
                <h2>Rent performance</h2>
              </div>
              <button className="text-button" type="button">Last 6 months <ChevronRight size={15} /></button>
            </div>
            <div className="collection-summary">
              <div>
                <strong>81.7%</strong>
                <span>collected</span>
              </div>
              <p><TrendingUp size={16} /> Collection pace is 8.4% ahead of June.</p>
            </div>
            <div className="chart" aria-label="Billed and collected over six months">
              <div className="chart-axis"><span>₹4.8L</span><span>₹2.4L</span><span>₹0</span></div>
              <div className="chart-bars">
                {collectionSeries.map((point) => (
                  <div className="chart-group" key={point.month}>
                    <div className="bar-stack">
                      <motion.span
                        className="bar billed"
                        initial={{ height: 0 }}
                        animate={{ height: `${(point.billed / maxChart) * 100}%` }}
                        transition={{ duration: 0.42 }}
                        title={`${point.month} billed ₹${point.billed}k`}
                      />
                      <motion.span
                        className="bar collected"
                        initial={{ height: 0 }}
                        animate={{ height: `${(point.collected / maxChart) * 100}%` }}
                        transition={{ duration: 0.42, delay: 0.08 }}
                        title={`${point.month} collected ₹${point.collected}k`}
                      />
                    </div>
                    <small>{point.month}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="chart-legend"><span><i className="legend-billed" /> Billed</span><span><i className="legend-collected" /> Collected</span></div>
          </article>

          <article className="panel action-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Action centre</span>
                <h2>Needs your review</h2>
              </div>
              <StatusPill tone="warning">{pending.length + 5} open</StatusPill>
            </div>
            <div className="action-list">
              <button type="button">
                <span className="action-icon action-lime"><ReceiptText size={18} /></span>
                <span><strong>{pending.length} payment proofs</strong><small>₹21,700 awaiting verification</small></span>
                <ChevronRight size={18} />
              </button>
              <button type="button">
                <span className="action-icon action-peach"><MessageCircleMore size={18} /></span>
                <span><strong>2 urgent complaints</strong><small>Internet · plumbing</small></span>
                <ChevronRight size={18} />
              </button>
              <button type="button">
                <span className="action-icon action-blue"><UserRoundX size={18} /></span>
                <span><strong>3 move-outs</strong><small>Settlement due this month</small></span>
                <ChevronRight size={18} />
              </button>
              <button type="button">
                <span className="action-icon action-sand"><Clock3 size={18} /></span>
                <span><strong>6 overdue residents</strong><small>Next reminder at 10:00 AM</small></span>
                <ChevronRight size={18} />
              </button>
            </div>
          </article>
        </section>

        <section className="panel payment-panel">
          <div className="panel-head panel-head-wrap">
            <div>
              <span className="eyebrow">Payment review</span>
              <h2>Verify before issuing a receipt</h2>
              <p>UPI screenshots and UTRs are evidence only. Confirm the credit in the PG bank account.</p>
            </div>
            <button className="button button-quiet" type="button"><Download size={16} /> Export queue</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Resident</th><th>Submission</th><th>Amount</th><th>Reference</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id} className={review.state !== "pending_review" ? "row-muted" : ""}>
                    <td><div className="resident-cell"><span className="avatar">{review.initials}</span><span><strong>{review.tenant}</strong><small>{review.room}</small></span></div></td>
                    <td><strong>{review.invoice}</strong><small>{review.method} · {review.submittedAt}</small>{review.warning && <em><CircleAlert size={13} /> {review.warning}</em>}</td>
                    <td className="amount-cell">{currency(review.amount)}</td>
                    <td><code>{review.utr}</code></td>
                    <td>
                      {review.state === "pending_review" && <StatusPill tone="warning">Pending review</StatusPill>}
                      {review.state === "approved" && <StatusPill tone="success">Approved</StatusPill>}
                      {review.state === "rejected" && <StatusPill tone="danger">Rejected</StatusPill>}
                    </td>
                    <td>
                      {review.state === "pending_review" ? (
                        <div className="table-actions">
                          <button type="button" className="approve-button" onClick={() => updateReview(review.id, "approved")} aria-label={`Approve ${review.tenant}`}><Check size={16} /> Approve</button>
                          <button type="button" className="icon-button" onClick={() => updateReview(review.id, "rejected")} aria-label={`Reject ${review.tenant}`}><X size={17} /></button>
                        </div>
                      ) : <button className="icon-button" type="button" aria-label="Open payment details"><MoreHorizontal size={18} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dashboard-grid dashboard-grid-bottom">
          <article className="panel room-panel">
            <div className="panel-head">
              <div><span className="eyebrow">Rooms & beds</span><h2>Live occupancy snapshot</h2></div>
              <button className="text-button" type="button">View all <ArrowRight size={15} /></button>
            </div>
            <div className="room-grid">
              {roomSummaries.map((room) => (
                <button className="room-card" type="button" key={room.id}>
                  <span className={`room-state room-${room.state}`} />
                  <span className="room-title"><strong>{room.room}</strong><small>{room.floor} floor</small></span>
                  <span className="bed-count"><BedDouble size={16} /> {room.occupied}/{room.total}</span>
                  <small>{currency(room.rent)} / bed</small>
                </button>
              ))}
            </div>
            <div className="occupancy-legend"><span><i className="dot-occupied" /> Occupied</span><span><i className="dot-vacant" /> Vacancy</span><span><i className="dot-notice" /> Notice</span><span><i className="dot-maintenance" /> Maintenance</span></div>
          </article>

          <article className="panel activity-panel">
            <div className="panel-head"><div><span className="eyebrow">Sample feed</span><h2>Recent activity preview</h2></div><button aria-label="Open sample activity options" className="icon-button" type="button"><MoreHorizontal size={18} /></button></div>
            <div className="activity-list">
              {recentActivity.map((item) => (
                <div className="activity-item" key={item.id}>
                  <span className={`activity-dot activity-${item.kind}`} />
                  <span><strong>{item.title}</strong><small>{item.description}</small></span>
                  <time>{item.time}</time>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="panel complaint-strip">
          <div className="panel-head"><div><span className="eyebrow">Operations</span><h2>Complaint pulse</h2></div><button className="text-button" type="button">Open board <ArrowRight size={15} /></button></div>
          <div className="complaint-cards">
            {complaints.map((complaint) => (
              <button type="button" key={complaint.id}>
                <span><StatusPill tone={complaint.priority === "High" ? "danger" : complaint.priority === "Medium" ? "warning" : "neutral"}>{complaint.priority}</StatusPill><small>{complaint.id}</small></span>
                <strong>{complaint.title}</strong>
                <p>{complaint.category} · Room {complaint.room}</p>
                <footer><span>{complaint.state.replaceAll("_", " ")}</span><time>{complaint.updated}</time></footer>
              </button>
            ))}
          </div>
        </section>
      </motion.div>

      <AnimatePresence>
        {modal === "cash" && (
          <DashboardModal title="Preview a cash payment" description="This simulation demonstrates the fields and approval state; it writes no ledger or audit record." onClose={() => setModal(null)}>
            <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setModal(null); notify("Preview only: cash entry staged locally; nothing was recorded."); }}>
              <label>Resident<select defaultValue="Mira Kapoor"><option>Mira Kapoor · A-204</option><option>Kavya Mehta · B-105</option><option>Sana Iyer · C-301</option></select></label>
              <div className="form-row"><label>Amount<input defaultValue="8500" inputMode="numeric" /></label><label>Collected on<input defaultValue="2026-07-17" type="date" /></label></div>
              <label>Collection note<textarea defaultValue="Collected at the front desk. Pending accountant confirmation." rows={3} /></label>
              <div className="modal-note"><ShieldCheck size={17} /><span>Corrections are recorded as reversals. Approved ledger entries are never deleted.</span></div>
              <button className="button button-primary button-full" type="submit"><Banknote size={17} /> Preview cash review</button>
            </form>
          </DashboardModal>
        )}
        {modal === "notice" && (
          <DashboardModal title="Preview a property notice" description="Explore the bilingual notice workflow. No WhatsApp message is queued from this demo." onClose={() => setModal(null)}>
            <form className="modal-form" onSubmit={(event) => { event.preventDefault(); setModal(null); notify("Preview only: notice timing checked locally; no message was scheduled."); }}>
              <label>Audience<select><option>All 48 residents</option><option>First floor</option><option>Second floor</option><option>Selected rooms</option></select></label>
              <label>Title<input defaultValue="Water supply maintenance" /></label>
              <label>English message<textarea defaultValue="Water supply will pause from 11 AM to 1 PM tomorrow for scheduled maintenance." rows={3} /></label>
              <label>Hindi message<textarea defaultValue="निर्धारित रखरखाव के कारण कल सुबह 11 बजे से दोपहर 1 बजे तक पानी की आपूर्ति बंद रहेगी।" rows={3} /></label>
              <button className="button button-primary button-full" type="submit"><Send size={17} /> Preview schedule</button>
            </form>
          </DashboardModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}><Check size={18} /> {toast}</motion.div>}
      </AnimatePresence>
    </MotionConfig>
  );
}

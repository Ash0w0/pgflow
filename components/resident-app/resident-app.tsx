"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  CircleHelp,
  Droplets,
  Home,
  KeyRound,
  Languages,
  LifeBuoy,
  LogOut,
  MessageCircle,
  ReceiptText,
  Smartphone,
  Sparkles,
  UserRound,
  UtensilsCrossed,
  WalletCards,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useBrand } from "@/components/brand-provider";
import { editorialSerif } from "@/components/home/fonts";
import type { ResidentAppData, ResidentBill, ResidentTicket, ResidentTicketCategory } from "@/lib/resident-app-types";
import { COPY, SUGGESTIONS, type Copy, type Language } from "./copy";
import "./resident-app.css";

type Tab = "home" | "payments" | "help" | "me";

const LANGUAGE_KEY = "pgflow-resident-language";
const LANGUAGE_EVENT = "pgflow-resident-language";
const CATEGORIES: { id: ResidentTicketCategory; icon: LucideIcon; label: keyof Copy }[] = [
  { id: "wifi", icon: Wifi, label: "catWifi" },
  { id: "plumbing", icon: Droplets, label: "catPlumbing" },
  { id: "electrical", icon: Zap, label: "catElectrical" },
  { id: "cleaning", icon: Sparkles, label: "catCleaning" },
  { id: "food", icon: UtensilsCrossed, label: "catFood" },
  { id: "other", icon: CircleHelp, label: "catOther" },
];

function subscribeLanguage(callback: () => void) {
  window.addEventListener(LANGUAGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function useLanguage(): [Language, (next: Language) => void] {
  const language = useSyncExternalStore<Language>(
    subscribeLanguage,
    () => (window.localStorage.getItem(LANGUAGE_KEY) === "hi" ? "hi" : "en"),
    () => "en",
  );
  return [language, (next) => {
    window.localStorage.setItem(LANGUAGE_KEY, next);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }];
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function ResidentApp({ data }: { data: ResidentAppData }) {
  const brand = useBrand();
  const router = useRouter();
  const [language, setLanguage] = useLanguage();
  const [tab, setTab] = useState<Tab>("home");
  const [tickets, setTickets] = useState<ResidentTicket[]>(data.tickets);
  const [sheet, setSheet] = useState<ResidentTicketCategory | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const t = COPY[language];
  const locale = language === "hi" ? "hi-IN" : "en-IN";

  useEffect(() => {
    document.documentElement.lang = language;
    return () => { document.documentElement.lang = "en"; };
  }, [language]);

  const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  const shortDate = (value: string) => value
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value))
    : "—";
  const longDate = (value: string) => value
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(`${value}T00:00:00+05:30`))
    : "—";
  const monthName = (period: string) => /^\d{4}-\d{2}$/.test(period)
    ? new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`))
    : period;

  const billLabel = (bill: ResidentBill) => /^\d{4}-\d{2}$/.test(bill.period)
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${bill.period}-01T00:00:00Z`))
    : bill.periodLabel;

  const unpaid = data.bills.filter((bill) => bill.status !== "paid").sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const focus: ResidentBill | undefined = unpaid[0] ?? data.bills.find((bill) => bill.period === data.today.slice(0, 7)) ?? data.bills[0];
  const receiptFor = (billId: string) => data.payments.find((payment) => payment.billId === billId && payment.receiptNumber);
  const receiptCount = data.payments.filter((payment) => payment.receiptNumber).length;
  const payHref = (bill: ResidentBill) => `/pay/${data.demo ? bill.number : bill.id}`;
  const receiptHref = (paymentId: string) => `/api/payments/${paymentId}/receipt`;
  const greeting = data.hour < 12 ? t.morning : data.hour < 17 ? t.afternoon : t.evening;

  const months = Array.from({ length: 6 }, (_, index) => {
    const [year, month] = data.today.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 - (5 - index), 1));
    const period = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      period,
      label: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date),
      status: data.bills.find((bill) => bill.period === period)?.status ?? "none",
    };
  });
  const billedMonths = months.filter((month) => month.status !== "none");
  const activeTicket = tickets.find((ticket) => ticket.status === "open" || ticket.status === "in_progress");

  function dueLine(bill: ResidentBill) {
    const days = daysBetween(data.today, bill.dueDate);
    if (days < 0) return t.lateBy(-days);
    if (days === 0) return t.dueToday;
    return t.dueIn(days);
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (!data.demo) {
        const response = await fetch("/api/auth/sign-out", { method: "POST" });
        if (!response.ok) throw new Error("sign-out");
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setSigningOut(false);
    }
  }

  const tabs: { id: Tab; icon: LucideIcon; label: string }[] = [
    { id: "home", icon: Home, label: t.home },
    { id: "payments", icon: WalletCards, label: t.payments },
    { id: "help", icon: LifeBuoy, label: t.help },
    { id: "me", icon: UserRound, label: t.me },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className={`ra-shell ${editorialSerif.variable}`}>
        <header className="ra-top">
          <div className="ra-brand">
            <span className="ra-brand-symbol" aria-hidden="true">{Array.from(brand.shortName.trim())[0]?.toUpperCase() ?? "P"}</span>
            <strong>{data.demo ? data.pg.name : brand.shortName}</strong>
          </div>
          <button className="ra-language" type="button" onClick={() => setLanguage(language === "en" ? "hi" : "en")} aria-label={t.language}>
            <Languages size={15} aria-hidden="true" />{language === "en" ? "हिंदी" : "English"}
          </button>
        </header>

        <main className="ra-main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
              {tab === "home" && (
                <>
                  <section className="ra-hello">
                    <p>{greeting},</p>
                    <h1>{data.resident.firstName}</h1>
                    {data.resident.roomLabel && <span className="ra-room">{data.resident.roomLabel}</span>}
                  </section>
                  {data.demo && <p className="ra-banner">{t.demoNote}</p>}
                  {data.resident.onNotice && <p className="ra-banner ra-banner-warn">{t.noticeNote}</p>}

                  <section className={`ra-pass ra-pass-${focus?.status ?? "none"}`} aria-label={t.rentPass}>
                    <div className="ra-pass-top">
                      <div className="ra-pass-label"><span>{t.rentPass}</span><span>{focus ? billLabel(focus) : data.pg.name}</span></div>
                      {!focus && (<><h2>{t.noBillTitle}</h2><p>{t.noBillBody}</p></>)}
                      {focus && focus.status === "paid" && (
                        <div className="ra-pass-clear">
                          <div><h2>{t.clearTitle}</h2><p>{t.clearBody(monthName(focus.period))}</p></div>
                          <motion.span className="ra-stamp" initial={{ scale: 1.9, opacity: 0, rotate: -22 }} animate={{ scale: 1, opacity: 1, rotate: -9 }} transition={{ type: "spring", stiffness: 320, damping: 17, delay: 0.25 }}>{t.paidStamp}</motion.span>
                        </div>
                      )}
                      {focus && focus.status !== "paid" && (
                        <>
                          <strong className="ra-amount">{money(focus.balance)}</strong>
                          {focus.paid > 0 && (
                            <>
                              <div className="ra-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (focus.paid / focus.total) * 100)}%` }} /></div>
                              <p className="ra-pass-meta">{t.partPaid(money(focus.paid))}</p>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {focus && (
                      <div className="ra-pass-stub">
                        {focus.status === "in_review" && (
                          <>
                            <ol className="ra-relay" aria-label={t.inReviewTitle}>
                              <li className="done"><span><Check size={13} /></span>{t.stepSent}</li>
                              <li className="live"><span /><i aria-hidden="true" />{t.stepCheck}</li>
                              <li><span />{t.stepReceipt}</li>
                            </ol>
                            <p className="ra-pass-meta"><strong>{t.inReviewTitle}.</strong> {t.inReviewBody}</p>
                          </>
                        )}
                        {(focus.status === "due" || focus.status === "overdue") && (
                          <>
                            <div className="ra-stub-row">
                              <div><small>{t.dueOn}</small><strong>{shortDate(focus.dueDate)}</strong></div>
                              <span className={`ra-chip ${focus.status === "overdue" ? "late" : ""}`}>{dueLine(focus)}</span>
                            </div>
                            {data.pg.upiReady
                              ? <Link className="ra-cta" href={payHref(focus)}>{t.pay} {money(focus.balance)}<ArrowUpRight size={18} aria-hidden="true" /></Link>
                              : <p className="ra-pass-meta">{t.noUpi}</p>}
                            {data.pg.upiReady && <p className="ra-pass-hint">{t.payHint}</p>}
                          </>
                        )}
                        {focus.status === "paid" && (() => {
                          const receipt = receiptFor(focus.id);
                          return receipt
                            ? <a className="ra-cta ra-cta-quiet" href={receiptHref(receipt.id)} target="_blank" rel="noreferrer"><ReceiptText size={17} aria-hidden="true" />{t.viewReceipt} · <span className="ra-mono">{receipt.receiptNumber}</span></a>
                            : null;
                        })()}
                        {unpaid.length > 1 && <button className="ra-more" type="button" onClick={() => setTab("payments")}>{t.moreBills(unpaid.length - 1)}<ChevronRight size={15} aria-hidden="true" /></button>}
                      </div>
                    )}
                  </section>

                  {billedMonths.length > 0 && (
                    <section className="ra-card">
                      <div className="ra-card-head"><h2>{t.record}</h2><span>{t.recordCount(billedMonths.filter((month) => month.status === "paid").length, billedMonths.length)}</span></div>
                      <ol className="ra-months">
                        {months.map((month, index) => (
                          <motion.li key={month.period} className={`ra-month ra-month-${month.status}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index }}>
                            <span aria-hidden="true">{month.status === "paid" && <Check size={14} />}</span>
                            <small>{month.label}</small>
                          </motion.li>
                        ))}
                      </ol>
                    </section>
                  )}

                  <section className="ra-actions">
                    <button type="button" onClick={() => setTab("help")}><span className="ra-action-icon"><LifeBuoy size={19} /></span><strong>{t.reportProblem}</strong><small>{t.reportHint}</small></button>
                    <button type="button" onClick={() => setTab("payments")}><span className="ra-action-icon"><ReceiptText size={19} /></span><strong>{t.receipts}</strong><small>{t.receiptsHint(receiptCount)}</small></button>
                    {data.pg.supportPhone && (
                      <a href={`https://wa.me/${data.pg.supportPhone}`} target="_blank" rel="noreferrer"><span className="ra-action-icon"><MessageCircle size={19} /></span><strong>{t.whatsapp}</strong><small>{t.whatsappHint}</small></a>
                    )}
                  </section>

                  {activeTicket && (
                    <button className="ra-card ra-ticket-peek" type="button" onClick={() => setTab("help")}>
                      <TicketRow ticket={activeTicket} t={t} date={shortDate(activeTicket.createdAt)} />
                    </button>
                  )}
                </>
              )}

              {tab === "payments" && (
                <>
                  <h1 className="ra-title">{t.payments}</h1>
                  <section className="ra-card">
                    <div className="ra-card-head"><h2>{t.bills}</h2></div>
                    {data.bills.length === 0 && <p className="ra-empty">{t.noBills}</p>}
                    <ul className="ra-list">
                      {data.bills.map((bill) => (
                        <li key={bill.id}>
                          <div><strong>{billLabel(bill)}</strong><small>{bill.status === "paid" ? money(bill.total) : `${t.dueOn} ${shortDate(bill.dueDate)}`}</small></div>
                          <div className="ra-list-end">
                            <strong>{money(bill.status === "paid" ? bill.total : bill.balance)}</strong>
                            {(bill.status === "due" || bill.status === "overdue") && data.pg.upiReady
                              ? <Link className="ra-pill-button" href={payHref(bill)}>{t.pay}</Link>
                              : <span className={`ra-status ra-status-${bill.status}`}>{bill.status === "paid" ? t.statusPaid : bill.status === "in_review" ? t.statusReview : bill.status === "overdue" ? t.statusOverdue : t.statusDue}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="ra-card">
                    <div className="ra-card-head"><h2>{t.history}</h2></div>
                    {data.payments.length === 0 && <p className="ra-empty">{t.noHistory}</p>}
                    <ul className="ra-list">
                      {data.payments.map((payment) => (
                        <li key={payment.id} className={payment.state === "rejected" ? "ra-list-stack" : undefined}>
                          <span className="ra-method" aria-hidden="true">{payment.method === "cash" ? <Banknote size={17} /> : <Smartphone size={17} />}</span>
                          <div><strong>{payment.periodLabel}</strong><small>{payment.method === "cash" ? t.cash : t.upi} · {shortDate(payment.paidAt)}{payment.reference && <> · <span className="ra-mono">{payment.reference}</span></>}</small>
                            {payment.state === "rejected" && <small className="ra-warn">{t.rejectedHint}</small>}</div>
                          <div className="ra-list-end">
                            <strong>{money(payment.amount)}</strong>
                            {payment.receiptNumber
                              ? <a className="ra-pill-button ra-pill-quiet" href={receiptHref(payment.id)} target="_blank" rel="noreferrer">{t.receipt}</a>
                              : <span className={`ra-status ra-status-${payment.state === "rejected" ? "overdue" : payment.state === "approved" ? "paid" : "in_review"}`}>{payment.state === "rejected" ? t.statusRejected : payment.state === "approved" ? t.statusPaid : t.statusReview}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              {tab === "help" && (
                <>
                  <h1 className="ra-title">{t.whatsWrong}</h1>
                  <p className="ra-sub">{t.whatsWrongHint}</p>
                  <section className="ra-categories">
                    {CATEGORIES.map(({ id, icon: Icon, label }, index) => (
                      <motion.button key={id} type="button" onClick={() => setSheet(id)} whileTap={{ scale: 0.96 }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * index }}>
                        <span><Icon size={22} /></span>{t[label] as string}
                      </motion.button>
                    ))}
                  </section>
                  <section className="ra-card">
                    <div className="ra-card-head"><h2>{t.myReports}</h2></div>
                    {tickets.length === 0 && <p className="ra-empty">{t.noReports}</p>}
                    <ul className="ra-tickets">
                      {tickets.map((ticket) => <li key={ticket.id}><TicketRow ticket={ticket} t={t} date={shortDate(ticket.createdAt)} /></li>)}
                    </ul>
                  </section>
                  {data.pg.supportPhone && (
                    <a className="ra-card ra-whatsapp" href={`https://wa.me/${data.pg.supportPhone}`} target="_blank" rel="noreferrer">
                      <MessageCircle size={20} aria-hidden="true" /><div><strong>{t.whatsapp}</strong><small>{t.whatsappHint}</small></div><ChevronRight size={17} aria-hidden="true" />
                    </a>
                  )}
                </>
              )}

              {tab === "me" && (
                <>
                  <section className="ra-profile">
                    <span className="ra-avatar" aria-hidden="true">{data.resident.fullName.slice(0, 1).toUpperCase()}</span>
                    <h1>{data.resident.fullName}</h1>
                    <p>{data.pg.name}</p>
                  </section>
                  <section className="ra-card">
                    <dl className="ra-facts">
                      <div><dt>{t.room}</dt><dd>{data.resident.roomLabel || "—"}</dd></div>
                      {data.resident.floorName && <div><dt>{t.floor}</dt><dd>{data.resident.floorName}</dd></div>}
                      <div><dt>{t.movedIn}</dt><dd>{longDate(data.resident.moveInDate)}</dd></div>
                      <div><dt>{t.rent}</dt><dd>{money(data.resident.monthlyRent)}</dd></div>
                      <div><dt>{t.deposit}</dt><dd>{money(data.resident.deposit)}</dd></div>
                      <div><dt>{t.phone}</dt><dd className="ra-mono">{data.resident.phoneMasked}</dd></div>
                    </dl>
                  </section>
                  <section className="ra-card ra-menu">
                    <button type="button" onClick={() => setLanguage(language === "en" ? "hi" : "en")}><Languages size={18} aria-hidden="true" /><span>{t.language}</span><em>{language === "en" ? "English" : "हिंदी"}</em></button>
                    {!data.demo && <Link href="/account/password"><KeyRound size={18} aria-hidden="true" /><span>{t.changePassword}</span><ChevronRight size={16} aria-hidden="true" /></Link>}
                    <button type="button" onClick={signOut} disabled={signingOut}><LogOut size={18} aria-hidden="true" /><span>{signingOut ? t.signingOut : t.signOut}</span></button>
                  </section>
                  <section className="ra-install"><Smartphone size={18} aria-hidden="true" /><div><strong>{t.install}</strong><small>{t.installBody}</small></div></section>
                </>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="ra-powered">Powered by <strong>{brand.platformName}</strong></p>
        </main>

        <nav className="ra-nav" aria-label="Sections">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button key={id} type="button" className={tab === id ? "active" : undefined} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); window.scrollTo({ top: 0 }); }}>
              {tab === id && <motion.span className="ra-nav-pill" layoutId="ra-nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>

        <AnimatePresence>
          {sheet && (
            <ReportSheet
              key={sheet}
              category={sheet}
              language={language}
              t={t}
              demo={data.demo}
              onClose={() => setSheet(null)}
              onCreated={(ticket) => setTickets((current) => [ticket, ...current])}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function TicketRow({ ticket, t, date }: { ticket: ResidentTicket; t: Copy; date: string }) {
  const step = ticket.status === "open" ? 1 : ticket.status === "in_progress" ? 2 : 3;
  const Icon = CATEGORIES.find((category) => category.id === ticket.category)?.icon ?? CircleHelp;
  return (
    <div className="ra-ticket">
      <span className="ra-method" aria-hidden="true"><Icon size={17} /></span>
      <div>
        <strong>{ticket.title}</strong>
        <small>{date} · {step === 1 ? t.tReported : step === 2 ? t.tWorking : t.tFixed}</small>
        <div className="ra-steps" role="img" aria-label={step === 1 ? t.tReported : step === 2 ? t.tWorking : t.tFixed}>
          {[1, 2, 3].map((index) => <span key={index} className={index <= step ? "on" : undefined} />)}
        </div>
      </div>
    </div>
  );
}

function ReportSheet({ category, language, t, demo, onClose, onCreated }: {
  category: ResidentTicketCategory;
  language: Language;
  t: Copy;
  demo: boolean;
  onClose: () => void;
  onCreated: (ticket: ResidentTicket) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = CATEGORIES.find((item) => item.id === category)!;

  useEffect(() => {
    const previous = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !sending) onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, sending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (sending || cleanTitle.length < 3) return;
    setSending(true);
    setError(null);
    try {
      let ticket: ResidentTicket = { id: `local-${Date.now()}`, category, title: cleanTitle, status: "open", createdAt: new Date().toISOString() };
      if (!demo) {
        const response = await fetch("/api/tenant/complaints", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ category, title: cleanTitle, description }),
        });
        const result = await response.json().catch(() => null) as { ticket?: ResidentTicket; error?: string } | null;
        if (!response.ok || !result?.ticket) throw new Error(result?.error ?? t.errorGeneric);
        ticket = result.ticket;
      }
      onCreated(ticket);
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.errorGeneric);
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div className="ra-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.target === event.currentTarget && !sending && onClose()}>
      <motion.section className="ra-sheet" role="dialog" aria-modal="true" aria-labelledby="ra-sheet-title" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
        <span className="ra-grabber" aria-hidden="true" />
        {sent ? (
          <div className="ra-sent">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}><Check size={30} /></motion.span>
            <h2 id="ra-sheet-title">{t.sent}</h2>
            <p>{t.sentBody}</p>
            <button className="ra-cta" type="button" onClick={onClose}>{t.done}</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="ra-sheet-head">
              <span className="ra-action-icon"><meta.icon size={20} /></span>
              <div><small>{t[meta.label] as string}</small><h2 id="ra-sheet-title">{t.sheetTitle}</h2></div>
              <button type="button" className="ra-close" onClick={onClose} aria-label={t.cancel}><X size={18} /></button>
            </div>
            {SUGGESTIONS[category][language].length > 0 && (
              <div className="ra-suggestions">
                {SUGGESTIONS[category][language].map((suggestion) => (
                  <button key={suggestion} type="button" className={title === suggestion ? "on" : undefined} onClick={() => setTitle(suggestion)}>{suggestion}</button>
                ))}
              </div>
            )}
            <label>{t.titleLabel}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required minLength={3} autoComplete="off" /></label>
            <label>{t.detailLabel}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} /></label>
            {error && <p className="ra-error" role="alert">{error}</p>}
            <button className="ra-cta" type="submit" disabled={sending || title.trim().length < 3}>{sending ? t.sending : t.send}</button>
          </form>
        )}
      </motion.section>
    </motion.div>
  );
}

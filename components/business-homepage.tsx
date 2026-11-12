import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BedDouble, Check, Mail, MapPin, MessageCircle, Minus, Plus } from "lucide-react";
import { ClosingComposer } from "./home/closing-composer";
import { FirstOfMonth } from "./home/first-of-month";
import { editorialSerif, handwriting } from "./home/fonts";
import { HeroRelay } from "./home/hero-relay";
import { HowItWorks } from "./home/how-it-works";
import { LeakMeter } from "./home/leak-meter";
import { RegisterCompare } from "./home/register-compare";
import { Reveal, Signature } from "./home/reveal";
import "./home/home.css";
import {
  DEMO_REQUEST_MESSAGE,
  FOUNDER,
  FOUNDING_REQUEST_MESSAGE,
  FOUNDING_TOTAL_SPOTS,
  businessCity,
  contactEmail,
  demoBookingHref,
  formattedWhatsAppNumber,
  foundingSpotsLeft,
  legalBusinessName,
  publicWhatsAppNumber,
} from "@/lib/marketing";

const PASSES = [
  {
    role: "Owner",
    line: "Sees everything. Decides what counts as paid.",
    can: ["Approve or reject every payment", "Set your own UPI and brand colours", "Add managers and switch them off", "Import rooms and residents from Excel"],
    cannot: [],
  },
  {
    role: "Manager",
    line: "Runs the floor. Can't touch the money rules.",
    can: ["Record cash with their name on it", "Send payment links on WhatsApp", "Handle complaints and move-outs", "Flag a payment approved by mistake"],
    cannot: ["Approve UPI payments", "Change your UPI or residents"],
  },
  {
    role: "Resident",
    line: "Gets a message. Taps a link. Done.",
    can: ["Rent reminder on WhatsApp", "Pay your UPI from a secure link", "Receipt on WhatsApp after you approve"],
    cannot: ["No app to install", "No password to forget"],
  },
] as const;

const PROMISES = [
  { title: "Hold your money.", body: "Rent goes from the resident's UPI app straight to yours. PGFlow is not a payment gateway and takes no cut of rent." },
  { title: "Approve a payment for you.", body: "A screenshot is proof to check, not money received. You decide what counts as paid." },
  { title: "Message residents without your say.", body: "Automatic reminders and receipts stay off until you switch them on for your PG." },
  { title: "Mix your PG with anyone else's.", body: "Every PG gets its own private workspace and web address. Payment proofs are stored privately, never on public links." },
  { title: "Erase history.", body: "Mistakes are fixed with a new, visible entry. The original record always stays, so every rupee can be traced." },
] as const;

const FAQS = [
  { q: "Does the rent come to my bank account?", a: "Yes. Residents pay straight to your own UPI ID. PGFlow never holds your money and there is no payment gateway taking a cut." },
  { q: "Do residents need to download an app?", a: "No. Residents get a WhatsApp message with a secure link for one job: see the rent, pay your UPI, share proof, or open the receipt." },
  { q: "Is there a free trial?", a: "Yes. Every PG gets 15 days free with everything unlocked. If you continue, we switch you to a paid plan on WhatsApp. If you don't, your data stays viewable and nothing new can be added." },
  { q: "How much does it cost?", a: "We share pricing on a short call, because it depends on the size of your PG. Founding PGs lock their price for 2 years." },
  { q: "Can my manager or warden use it?", a: "Yes. You add them from Settings. They get their own login, can record cash and follow up with residents, and you approve what counts as paid." },
  { q: "I have everything in a register or Excel. Do I type it all in?", a: "No. Upload your rooms and residents as a spreadsheet and PGFlow checks every row before saving anything. For Founding PGs, we set it up for you." },
  { q: "Do you support Hindi?", a: "Resident messages can go out in Hindi or English. We support you in both on WhatsApp and calls. The owner workspace is in English today." },
  { q: "What if it doesn't work for my PG?", a: "Founding PGs get a 30-day money-back guarantee. If PGFlow does not save you time in the first 30 days, we refund the full amount." },
] as const;

function ExternalAction({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (href.startsWith("https://")) {
    return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link className={className} href={href}>{children}</Link>;
}

function Logo() {
  return (
    <Link className="ph-logo" href="/" aria-label="PGFlow home">
      <span aria-hidden="true">P</span>
      <strong>PGFlow</strong>
    </Link>
  );
}

export function BusinessHomepage() {
  const demoHref = demoBookingHref();
  const foundingHref = demoBookingHref(FOUNDING_REQUEST_MESSAGE);
  const whatsappDisplay = formattedWhatsAppNumber();
  const whatsappNumber = publicWhatsAppNumber();
  const email = contactEmail();
  const legalName = legalBusinessName();
  const city = businessCity();
  const spotsLeft = foundingSpotsLeft();
  const taken = spotsLeft === null ? 0 : FOUNDING_TOTAL_SPOTS - spotsLeft;
  const spotsLine = spotsLeft === null
    ? `Open to the first ${FOUNDING_TOTAL_SPOTS} PGs only`
    : `${spotsLeft} of ${FOUNDING_TOTAL_SPOTS} Founding PG spots left`;

  return (
    <main className={`ph ${editorialSerif.variable} ${handwriting.variable}`}>
      <a className="ph-skip" href="#how-it-works">Skip to how it works</a>

      <header className="ph-nav">
        <div className="ph-container ph-nav-inner">
          <Logo />
          <nav aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#promises">Our promises</a>
            <a href="#founding">Founding PGs</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="ph-nav-actions">
            <Link className="ph-link-btn" href="/login">Open workspace</Link>
            <ExternalAction className="ph-btn ph-btn-primary ph-btn-sm" href={demoHref}>Book a demo <ArrowRight size={16} /></ExternalAction>
          </div>
        </div>
      </header>

      <section className="ph-hero" aria-labelledby="hero-title">
        <div className="ph-container ph-hero-grid">
          <div className="ph-hero-copy">
            <p className="ph-stamp"><span aria-hidden="true" /> Built in {city.split(",")[0]} for Indian PGs</p>
            <h1 id="hero-title" className="ph-h1">
              Run your PG from WhatsApp. <em><mark>Every rupee</mark> accounted for.</em>
            </h1>
            <p className="ph-lead ph-hero-lead">
              Residents pay straight to your UPI from a WhatsApp link. You check the proof and tap approve. The receipt goes back on its own.
              No app for residents, no gateway in the middle, no register to tally at night.
            </p>
            <div className="ph-hero-actions">
              <ExternalAction className="ph-btn ph-btn-primary" href={demoHref}><MessageCircle size={18} /> Book a 15-min demo</ExternalAction>
              <a className="ph-btn ph-btn-quiet" href="#how-it-works">See how it works <ArrowRight size={17} /></a>
            </div>
            <ul className="ph-facts">
              <li><Check size={15} /> Money goes to your UPI, never to us</li>
              <li><Check size={15} /> You approve every payment</li>
              <li><Check size={15} /> 15 days free, everything unlocked</li>
            </ul>
          </div>
          <div className="ph-hero-stage">
            <HeroRelay />
            <p className="ph-hero-caption">Resident → WhatsApp → owner. Sample data, real product flow.</p>
          </div>
        </div>
      </section>

      <FirstOfMonth />
      <HowItWorks />
      <RegisterCompare />

      <section className="ph-passes" aria-labelledby="passes-title">
        <div className="ph-container">
          <Reveal className="ph-section-intro">
            <p className="ph-overline">Who sees what</p>
            <h2 id="passes-title" className="ph-h2">One PG, three kinds of access. <em>Nobody sees more than they should.</em></h2>
          </Reveal>
          <div className="ph-pass-row">
            {PASSES.map((pass, index) => (
              <Reveal key={pass.role} delay={index * 0.08} className={`ph-pass ph-pass-${pass.role.toLowerCase()}`}>
                <div className="ph-pass-hole" aria-hidden="true" />
                <span className="ph-pass-role">{pass.role}</span>
                <p className="ph-pass-line">{pass.line}</p>
                <ul>
                  {pass.can.map((item) => <li key={item}><Check size={15} /> {item}</li>)}
                  {pass.cannot.map((item) => <li key={item} className="is-not"><Minus size={15} /> {item}</li>)}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <LeakMeter />

      <section className="ph-promises" id="promises" aria-labelledby="promises-title">
        <div className="ph-container ph-promises-grid">
          <Reveal className="ph-promises-intro">
            <p className="ph-overline ph-overline-light">Our promises</p>
            <h2 id="promises-title" className="ph-h2">Things PGFlow <em>will never</em> do.</h2>
            <p className="ph-lead">Software that touches your rent has to earn trust. These are the lines we built the product around, and they are enforced in the system, not just written here.</p>
          </Reveal>
          <ol className="ph-promise-list">
            {PROMISES.map((promise, index) => (
              <Reveal key={promise.title} delay={index * 0.05}>
                <li>
                  <span className="ph-promise-n">{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>Never {promise.title.charAt(0).toLowerCase() + promise.title.slice(1)}</h3><p>{promise.body}</p></div>
                </li>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="ph-letter-section" aria-labelledby="letter-title">
        <div className="ph-container">
          <Reveal className="ph-letter">
            <p className="ph-letter-meta">A note from the founder · {city.split(",")[0]}</p>
            <h2 id="letter-title">I set up every Founding PG myself.</h2>
            <p>I spent years selling software to companies whose work happens on the ground and whose money gets tracked on paper. PG owners have the same problem, with less time and more phone calls.</p>
            <p>I built PGFlow so you can see every rupee from your phone, wherever you are, without changing how your residents pay. If you run a PG in Delhi NCR, I&apos;ll come and set it up with you.</p>
            <Signature name={FOUNDER.name.split(" ")[0]} />
            <strong>{FOUNDER.name}</strong>
            <small>{FOUNDER.role}</small>
          </Reveal>
        </div>
      </section>

      <section className="ph-founding" id="founding" aria-labelledby="founding-title">
        <div className="ph-container ph-founding-grid">
          <Reveal>
            <p className="ph-overline">{spotsLine}</p>
            <h2 id="founding-title" className="ph-h2">Ten beds. <em>Ten Founding PGs.</em></h2>
            <p className="ph-lead">We are starting small on purpose, so every early PG gets the founder&apos;s attention. Founding PGs get free setup from your register or Excel, the founding price locked for 2 years, and a 30-day money-back guarantee. We ask for honest feedback in return.</p>
            <div className="ph-hero-actions">
              <ExternalAction className="ph-btn ph-btn-primary" href={foundingHref}><MessageCircle size={18} /> Apply on WhatsApp</ExternalAction>
              <Link className="ph-btn ph-btn-quiet" href="/login">I already have a workspace</Link>
            </div>
          </Reveal>
          <div className="ph-beds" aria-label={spotsLeft === null ? `${FOUNDING_TOTAL_SPOTS} Founding PG spots` : spotsLine}>
            {Array.from({ length: FOUNDING_TOTAL_SPOTS }, (_, index) => (
              <Reveal key={index} delay={index * 0.04} className={`ph-bed ${index < taken ? "is-taken" : ""}`}>
                <BedDouble size={26} aria-hidden="true" />
                <span>#{String(index + 1).padStart(2, "0")}</span>
                <small>{index < taken ? "Taken" : "Open"}</small>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="ph-faq" id="faq" aria-labelledby="faq-title">
        <div className="ph-container ph-faq-grid">
          <div>
            <p className="ph-overline">Questions owners ask</p>
            <h2 id="faq-title" className="ph-h2">Before you <em>book a demo.</em></h2>
            <p className="ph-lead">Something else on your mind? Ask on WhatsApp. You will talk to the person who built PGFlow.</p>
          </div>
          <div className="ph-faq-list">
            {FAQS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}<span aria-hidden="true"><Plus size={18} /></span></summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ph-closing" aria-labelledby="closing-title">
        <div className="ph-container ph-closing-grid">
          <div>
            <h2 id="closing-title" className="ph-h2">Fifteen minutes. <em>Your whole PG on one screen.</em></h2>
            <p className="ph-lead">Tell us your beds and your city. We&apos;ll show you PGFlow running a PG like yours, and set yours up if it fits.</p>
          </div>
          <ClosingComposer href={demoHref} message={DEMO_REQUEST_MESSAGE} />
        </div>
      </section>

      <footer className="ph-footer">
        <div className="ph-container ph-footer-grid">
          <div className="ph-footer-brand">
            <Logo />
            <p>Your PG, beautifully run.</p>
          </div>
          <address className="ph-footer-contact">
            {whatsappNumber ? (
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp {whatsappDisplay}</a>
            ) : null}
            <a href={`mailto:${email}`}><Mail size={15} /> {email}</a>
            <span><MapPin size={15} /> {city}</span>
          </address>
          <nav className="ph-footer-links" aria-label="Footer">
            <ExternalAction className="" href={demoHref}>Book a demo <ArrowUpRight size={14} /></ExternalAction>
            <Link href="/login">Open workspace</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <p className="ph-footer-legal">© {new Date().getFullYear()} {legalName || "PGFlow"}. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Mail,
  MapPin,
  PlayCircle,
  X,
  BedDouble,
  Building2,
  Check,
  IndianRupee,
  ClipboardCheck,
  FileCheck2,
  Link2,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { HomepageWorkflowPlayer } from "./homepage-workflow-player";
import { LeakCalculator } from "./leak-calculator";
import {
  FOUNDER,
  FOUNDING_PLANS,
  FOUNDING_REQUEST_MESSAGE,
  FOUNDING_TOTAL_SPOTS,
  businessCity,
  contactEmail,
  demoBookingHref,
  formattedWhatsAppNumber,
  foundingSpotsLeft,
  legalBusinessName,
  publicDemoUrl,
  publicWhatsAppNumber,
} from "@/lib/marketing";

const relaySteps = [
  {
    icon: MessageCircle,
    title: "Start in WhatsApp",
    description: "Share a reviewed reminder, update, or secure task link without teaching residents a new system.",
  },
  {
    icon: Link2,
    title: "Keep the action focused",
    description: "Residents see only what they need: an invoice, payment instructions, proof upload, or receipt.",
  },
  {
    icon: ClipboardCheck,
    title: "Review before recording",
    description: "Owners and authorized staff verify financial evidence before it becomes a payment record.",
  },
  {
    icon: ReceiptText,
    title: "Leave an audit trail",
    description: "The workspace keeps the room, resident, payment, receipt, and activity history together.",
  },
];

const operatingRows = [
  {
    icon: BedDouble,
    title: "Rooms, beds, and occupancy",
    description: "Set up the property, assign residents, and see what is occupied, vacant, or changing.",
  },
  {
    icon: IndianRupee,
    title: "Rent and direct payments",
    description: "Generate rent, support direct UPI and staff-recorded cash, and keep payment review explicit.",
  },
  {
    icon: FileCheck2,
    title: "Proof, receipts, and reversals",
    description: "Review evidence, issue receipts after approval, and reverse records without erasing history.",
  },
  {
    icon: Wrench,
    title: "Everyday operations",
    description: "Keep resident onboarding, move-outs, maintenance work, and team follow-up in one workspace.",
  },
];

const comparisonRows = [
  { label: "Who has paid this month", register: "Flip pages", excel: "Check sheet and chats", pgflow: "One screen" },
  { label: "Rent reminders", register: "Calls one by one", excel: "Typed by hand", pgflow: "Reviewed WhatsApp drafts" },
  { label: "Where the money goes", register: "Owner or staff UPI", excel: "Several UPI numbers", pgflow: "Straight to your own UPI" },
  { label: "Cash collected by staff", register: "Written later, if at all", excel: "Entered when remembered", pgflow: "Recorded and approved by you" },
  { label: "Receipts", register: "Paper book", excel: "Screenshots", pgflow: "Issued after approval" },
  { label: "Changing a past entry", register: "Overwrite", excel: "Edit the cell", pgflow: "Reversal with full history" },
];

const faqs = [
  {
    question: "Does the rent come to my bank account?",
    answer: "Yes. Residents pay straight to your own UPI ID. PGFlow never holds your money and there is no payment gateway taking a cut.",
  },
  {
    question: "Do residents need to download an app?",
    answer: "No. Residents get a WhatsApp message with a secure link for one action: see the rent due, pay, share proof, or get the receipt.",
  },
  {
    question: "Can my manager or warden use it?",
    answer: "Yes. Staff get their own login with limited permissions. They can record cash and follow up with residents, and you approve what counts as paid.",
  },
  {
    question: "Is my data safe?",
    answer: "Each PG runs in its own private workspace, and only the people you add can see it. Payment proofs are stored privately, not on public links. You can ask for an export of your data at any time.",
  },
  {
    question: "I have everything in a register or Excel. Do I have to type it all in?",
    answer: "No. For Founding PGs, we set up your rooms, beds, residents and rents for you from your register or Excel sheet, and you check the totals before going live.",
  },
  {
    question: "Do you support Hindi?",
    answer: "Our team supports you in Hindi or English on WhatsApp and calls. The owner workspace is in English today.",
  },
  {
    question: "What if it doesn't work for my PG?",
    answer: "Founding PGs get a 30-day money-back guarantee. If PGFlow does not save you time in the first 30 days, we refund the full amount.",
  },
];

function ExternalAction({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  if (href.startsWith("https://")) {
    return <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link className={className} href={href}>{children}</Link>;
}

export function BusinessHomepage() {
  const demoHref = demoBookingHref();
  const foundingHref = demoBookingHref(FOUNDING_REQUEST_MESSAGE);
  const demoUrl = publicDemoUrl();
  const whatsappDisplay = formattedWhatsAppNumber();
  const whatsappNumber = publicWhatsAppNumber();
  const email = contactEmail();
  const legalName = legalBusinessName();
  const spotsLeft = foundingSpotsLeft();
  const spotsLine = spotsLeft === null
    ? `Open to the first ${FOUNDING_TOTAL_SPOTS} PGs only`
    : `${spotsLeft} of ${FOUNDING_TOTAL_SPOTS} Founding PG spots left`;

  return (
    <main className="business-home">
      <header className="home-nav">
        <Link className="home-logo" href="/" aria-label="PGFlow business homepage">
          <span aria-hidden="true">P</span>
          <strong>PGFlow</strong>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="home-nav-actions">
          <Link className="home-link-button" href="/login">Open workspace</Link>
          <ExternalAction className="home-primary-button home-nav-primary" href={demoHref}>
            Book a demo <ArrowRight size={17} />
          </ExternalAction>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy">
          <span className="home-kicker"><MessageCircle size={17} /> WhatsApp-first PG operations</span>
          <h1 id="home-hero-title">Run your PG from WhatsApp.</h1>
          <p>Every rupee of rent tracked. Every cash payment reviewed. Residents install nothing.</p>
          <div className="home-hero-actions">
            <ExternalAction className="home-primary-button" href={demoHref}>
              <MessageCircle size={18} /> Book a 15-min demo
            </ExternalAction>
            {demoUrl ? (
              <a className="home-secondary-button" href={demoUrl} target="_blank" rel="noopener noreferrer">
                <PlayCircle size={18} /> See a live demo PG
              </a>
            ) : (
              <a className="home-secondary-button" href="#pricing">
                <IndianRupee size={18} /> See founding prices
              </a>
            )}
          </div>
          <div className="home-trust-line" aria-label="PGFlow operating principles">
            <span><Check size={16} /> Rent goes straight to your UPI</span>
            <span><Check size={16} /> Every payment reviewed by you</span>
            <span><Check size={16} /> Free setup for Founding PGs</span>
          </div>
        </div>

        <div className="home-theatre" aria-labelledby="home-film-heading">
          <div className="home-theatre-head">
            <div>
              <span>Resident → WhatsApp → owner</span>
              <h2 id="home-film-heading">See the whole workflow</h2>
            </div>
            <span className="home-theatre-note"><ShieldCheck size={16} /> Product walkthrough · no audio</span>
          </div>
          <HomepageWorkflowPlayer />
        </div>
      </section>

      <section className="home-relay-section" id="how-it-works" aria-labelledby="relay-title">
        <div className="home-section-heading">
          <span>One conversation. One system of record.</span>
          <h2 id="relay-title">The familiar front door, backed by disciplined operations.</h2>
          <p>WhatsApp makes the next action easy. PGFlow keeps the data, permissions, review, and history behind it organized.</p>
        </div>
        <ol className="home-relay-list">
          {relaySteps.map(({ icon: Icon, title, description }, index) => (
            <li key={title}>
              <span className="home-relay-index">{index + 1}</span>
              <span className="home-relay-icon" aria-hidden="true"><Icon size={23} /></span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-leak-section" id="leak-calculator" aria-labelledby="leak-title">
        <div className="home-section-heading">
          <span>The cost of not knowing</span>
          <h2 id="leak-title">How much rent could be slipping through?</h2>
          <p>Most PGs don&apos;t lose money in one big hit. It goes a little at a time: a reminder not sent, a cash entry not written, a deposit adjusted twice. Put in your numbers.</p>
        </div>
        <LeakCalculator />
      </section>

      <section className="home-roles-section" id="for-everyone" aria-labelledby="roles-title">
        <div className="home-section-heading home-section-heading-light">
          <span>Built around the people in your PG</span>
          <h2 id="roles-title">One operating flow, with the right view for every role.</h2>
        </div>
        <div className="home-role-layout">
          <article className="home-role-owner">
            <div className="home-role-copy">
              <span className="home-role-icon"><Building2 size={25} /></span>
              <span className="home-role-label">Owner</span>
              <h3>See the whole PG without living inside spreadsheets.</h3>
              <p>Review rent activity, rooms, residents, receipts, move-outs, and what needs attention from one workspace.</p>
              <ExternalAction className="home-role-link" href={demoHref}>Book a 15-min demo <ArrowRight size={17} /></ExternalAction>
            </div>
            <div className="home-owner-surface" aria-label="Illustrative owner workspace summary">
              <header><span>Owner workspace</span><strong>Today</strong></header>
              <div className="home-owner-summary">
                <span><BedDouble size={19} /><small>Rooms</small><strong>Organized</strong></span>
                <span><UsersRound size={19} /><small>Residents</small><strong>In one register</strong></span>
                <span><ReceiptText size={19} /><small>Rent</small><strong>Reviewable</strong></span>
              </div>
              <div className="home-owner-action">
                <span><FileCheck2 size={20} /></span>
                <div><strong>Payment proof ready for review</strong><small>Match the transfer before recording it</small></div>
                <span>Open</span>
              </div>
              <div className="home-owner-action">
                <span><Wrench size={20} /></span>
                <div><strong>Maintenance follow-up</strong><small>Keep responsibility and status visible</small></div>
                <span>Track</span>
              </div>
            </div>
          </article>

          <div className="home-role-secondary">
            <article>
              <span className="home-role-icon"><ClipboardCheck size={24} /></span>
              <span className="home-role-label">Staff</span>
              <h3>Do the next job with clear permissions.</h3>
              <p>Record authorized cash, follow up on resident work, and keep the owner’s audit trail intact.</p>
            </article>
            <article>
              <span className="home-role-icon"><UserRound size={24} /></span>
              <span className="home-role-label">Resident</span>
              <h3>Use one secure link for one clear action.</h3>
              <p>View rent details, follow payment instructions, share proof, and keep the receipt, without entering the owner dashboard.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="home-compare-section" id="compare" aria-labelledby="compare-title">
        <div className="home-section-heading">
          <span>What changes on day one</span>
          <h2 id="compare-title">Register, Excel, or PGFlow.</h2>
        </div>
        <div className="home-compare-scroll">
          <table className="home-compare-table">
            <thead>
              <tr>
                <th scope="col"><span className="home-sr-only">Task</span></th>
                <th scope="col">Register</th>
                <th scope="col">Excel + WhatsApp</th>
                <th scope="col" className="home-compare-pgflow">PGFlow</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td><X size={15} aria-hidden="true" /> {row.register}</td>
                  <td><X size={15} aria-hidden="true" /> {row.excel}</td>
                  <td className="home-compare-pgflow"><Check size={15} aria-hidden="true" /> {row.pgflow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="home-operations-section" id="operations" aria-labelledby="operations-title">
        <div className="home-operations-intro">
          <span>The system behind the conversation</span>
          <h2 id="operations-title">Everything your PG needs to stay in flow.</h2>
          <p>PGFlow connects resident-facing actions to the operational records owners and staff actually need.</p>
        </div>
        <div className="home-operating-rows">
          {operatingRows.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <span aria-hidden="true"><Icon size={24} /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <Check size={20} aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className="home-pricing-section" id="pricing" aria-labelledby="pricing-title">
        <div className="home-section-heading">
          <span>Simple yearly pricing</span>
          <h2 id="pricing-title">Priced by beds. Founding PGs pay less, for 2 years.</h2>
          <p>Billed once a year. No payment gateway fees, because rent goes straight to your UPI. Founding prices apply to the first {FOUNDING_TOTAL_SPOTS} PGs and stay locked for 2 years.</p>
        </div>
        <div className="home-pricing-grid">
          {FOUNDING_PLANS.map((plan) => (
            <article key={plan.id} className={plan.highlight ? "home-plan home-plan-highlight" : "home-plan"}>
              <header>
                <h3>{plan.name}</h3>
                <span>{plan.beds}</span>
              </header>
              {plan.foundingPrice ? (
                <div className="home-plan-price">
                  <small>Founding price, year 1</small>
                  <strong>{plan.foundingPrice}<span>/year</span></strong>
                  <p><s>{plan.listPrice}</s> list price · {plan.perMonth}</p>
                </div>
              ) : (
                <div className="home-plan-price">
                  <small>For PG chains</small>
                  <strong>Custom</strong>
                  <p>Pilot first, then a plan built around your properties</p>
                </div>
              )}
              <ul>
                {plan.includes.map((item) => <li key={item}><Check size={15} aria-hidden="true" /> {item}</li>)}
              </ul>
              <ExternalAction className={plan.highlight ? "home-primary-button" : "home-secondary-button"} href={plan.foundingPrice ? foundingHref : demoHref}>
                {plan.foundingPrice ? "Claim founding price" : "Talk to us"}
              </ExternalAction>
            </article>
          ))}
        </div>
      </section>

      <section className="home-starter-section" id="founding" aria-labelledby="founding-title">
        <div>
          <span>{spotsLine}</span>
          <h2 id="founding-title">Become a Founding PG.</h2>
          <p>We set up your rooms, beds, residents and rents for you, free. You get the founding price locked for 2 years and a 30-day money-back guarantee. In return, we ask for honest feedback and a short review if PGFlow works for you.</p>
          <ul className="home-founding-points">
            <li><BadgeCheck size={17} /> Free setup from your register or Excel</li>
            <li><BadgeCheck size={17} /> Founding price locked for 2 years</li>
            <li><BadgeCheck size={17} /> 30-day money-back guarantee</li>
          </ul>
        </div>
        <div className="home-starter-actions">
          <ExternalAction className="home-primary-button" href={foundingHref}>
            <MessageCircle size={18} /> Apply on WhatsApp
          </ExternalAction>
          <Link className="home-secondary-button home-secondary-on-dark" href="/login">
            I already have a workspace
          </Link>
        </div>
      </section>

      <section className="home-founder-section" aria-labelledby="founder-title">
        <span className="home-founder-avatar" aria-hidden="true">AK</span>
        <div>
          <span className="home-founder-kicker">A note from the founder</span>
          <h2 id="founder-title">I set up every Founding PG myself.</h2>
          <p>I spent years selling software to companies whose work happens on the ground and whose money gets tracked on paper. PG owners have the same problem. I built PGFlow so you can see every rupee from your phone, wherever you are. If you run a PG in Delhi NCR, I&apos;ll come and set it up with you.</p>
          <strong>{FOUNDER.name}</strong>
          <small>{FOUNDER.role}</small>
        </div>
      </section>

      <section className="home-faq-section" id="faq" aria-labelledby="faq-title">
        <div className="home-section-heading">
          <span>Questions owners ask</span>
          <h2 id="faq-title">Before you book a demo.</h2>
        </div>
        <div className="home-faq-list">
          {faqs.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <div className="home-footer-brand">
          <Link className="home-logo" href="/" aria-label="PGFlow homepage">
            <span aria-hidden="true">P</span>
            <strong>PGFlow</strong>
          </Link>
          <p>Your PG, beautifully run.</p>
        </div>
        <address className="home-footer-contact">
          {whatsappNumber ? (
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> WhatsApp {whatsappDisplay}</a>
          ) : null}
          <a href={`mailto:${email}`}><Mail size={15} /> {email}</a>
          <span><MapPin size={15} /> {businessCity()}</span>
        </address>
        <div className="home-footer-links">
          <ExternalAction className="" href={demoHref}>Book a demo</ExternalAction>
          <Link href="/login">Open workspace</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <p className="home-footer-legal">© {new Date().getFullYear()} {legalName || "PGFlow"}. All rights reserved.</p>
      </footer>
    </main>
  );
}

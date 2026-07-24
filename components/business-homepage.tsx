import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  Check,
  IndianRupee,
  ClipboardCheck,
  FileCheck2,
  KeyRound,
  Link2,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";
import { HomepageWorkflowPlayer } from "./homepage-workflow-player";

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

export function BusinessHomepage() {
  return (
    <main className="business-home">
      <header className="home-nav">
        <Link className="home-logo" href="/" aria-label="PGFlow business homepage">
          <span aria-hidden="true">P</span>
          <strong>PGFlow</strong>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-everyone">For your PG</a>
          <a href="#operations">What it manages</a>
        </nav>
        <div className="home-nav-actions">
          <Link className="home-link-button" href="/login">Open workspace</Link>
          <Link className="home-primary-button home-nav-primary" href="/signup">
            Create your PG <ArrowRight size={17} />
          </Link>
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-copy">
          <span className="home-kicker"><MessageCircle size={17} /> WhatsApp-first PG operations</span>
          <h1 id="home-hero-title">Run your PG from WhatsApp.</h1>
          <p>Keep every room, resident, rent action, and everyday follow-up in one calm owner workspace.</p>
          <div className="home-hero-actions">
            <Link className="home-primary-button" href="/signup">
              Create your PG <ArrowRight size={18} />
            </Link>
            <Link className="home-secondary-button" href="/login">
              <KeyRound size={18} /> Open your workspace
            </Link>
          </div>
          <div className="home-trust-line" aria-label="PGFlow operating principles">
            <span><Check size={16} /> Direct UPI and cash</span>
            <span><Check size={16} /> Human-reviewed payments</span>
            <span><Check size={16} /> Your own PG subdomain</span>
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
              <Link href="/signup">Create your owner workspace <ArrowRight size={17} /></Link>
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
              <p>View rent details, follow payment instructions, share proof, and keep the receipt—without entering the owner dashboard.</p>
            </article>
          </div>
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

      <section className="home-starter-section" aria-labelledby="starter-title">
        <div>
          <span>Start small, run it for real</span>
          <h2 id="starter-title">Create your PG and begin with your first two residents.</h2>
          <p>New workspaces start with WhatsApp-assisted onboarding. When you need to add more residents, message PGFlow to upgrade.</p>
        </div>
        <div className="home-starter-actions">
          <Link className="home-primary-button" href="/signup">
            Start creating your PG <ArrowRight size={18} />
          </Link>
          <Link className="home-secondary-button home-secondary-on-dark" href="/login">
            I already have a workspace
          </Link>
        </div>
      </section>

      <footer className="home-footer">
        <Link className="home-logo" href="/" aria-label="PGFlow homepage">
          <span aria-hidden="true">P</span>
          <strong>PGFlow</strong>
        </Link>
        <p>Your PG, beautifully run.</p>
        <div>
          <Link href="/signup">Create your PG</Link>
          <Link href="/login">Open workspace</Link>
        </div>
      </footer>
    </main>
  );
}

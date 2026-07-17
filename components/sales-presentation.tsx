import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Check,
  Clock3,
  IndianRupee,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Smartphone,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { BrandMark, PoweredBy } from "./brand-mark";

export function SalesPresentation() {
  return (
    <main className="presentation-page">
      <header className="presentation-nav"><BrandMark /><span className="presentation-safe"><ShieldCheck size={15} /> Curated fictional data</span><div><Link href="/tenant">Tenant app</Link><Link className="button button-primary" href="/">Open dashboard <ArrowRight size={16} /></Link></div></header>
      <section className="presentation-hero">
        <div className="presentation-copy"><span className="demo-kicker"><Sparkles size={14} /> The WhatsApp-first operating system for PGs</span><h1>Rent on time.<br /><em>Operations in flow.</em></h1><p>Preview how every PG can receive its own branded app, rent ledger and WhatsApp assistant from one reusable template.</p><div className="presentation-actions"><Link className="button button-lime" href="/">Explore Nivasa demo <ArrowRight size={17} /></Link><Link className="button button-dark-ghost" href="/operator">See provisioning simulation</Link></div><div className="presentation-proof"><span><Check size={15} /> Direct UPI & cash only</span><span><Check size={15} /> English + Hindi direction</span><span><Check size={15} /> One shared codebase</span></div></div>
        <div className="presentation-product">
          <div className="product-window">
            <div className="product-window-top"><i /><i /><i /><span>Nivasa Demo House</span></div>
            <div className="product-window-body"><aside><span className="mini-logo">N</span>{[0,1,2,3,4,5].map((item) => <i key={item} className={item === 0 ? "active" : ""} />)}</aside><div className="mini-dashboard"><header><span /><i /><i /></header><h3>Good morning, Aarav.</h3><p>Here is what needs attention today.</p><div className="mini-metrics"><span><small>Collected</small><strong>₹3.86L</strong></span><span><small>Outstanding</small><strong>₹86.4K</strong></span><span><small>Occupancy</small><strong>48/60</strong></span></div><div className="mini-panels"><section><small>COLLECTIONS</small><strong>81.7%</strong><div className="mini-bars">{[62,70,78,68,85,74].map((height) => <i key={height} style={{ height: `${height}%` }} />)}</div></section><section><small>ACTION CENTRE</small>{["3 payment proofs","2 complaints","3 move-outs"].map((label) => <span key={label}>{label}<ArrowRight size={10} /></span>)}</section></div></div></div>
          </div>
          <div className="phone-card"><div className="phone-head"><span className="mini-logo">N</span><i /></div><small>Current amount due</small><strong>₹8,500</strong><p>Due 20 July</p><button type="button" disabled>UPI preview</button><span className="phone-status"><Clock3 size={13} /> Proof review is manual</span></div>
          <span className="floating-badge floating-whatsapp"><MessageCircleMore size={18} /><span><strong>WhatsApp-first</strong><small>Daily work without another app</small></span></span>
        </div>
      </section>
      <section className="presentation-stats"><div><WalletCards size={20} /><strong>81.7%</strong><span>fictional collection rate</span></div><div><BedDouble size={20} /><strong>60</strong><span>sample bed capacity</span></div><div><UsersRound size={20} /><strong>48</strong><span>fictional residents</span></div><div><Clock3 size={20} /><strong>&lt; 4 hr</strong><span>core handoff target</span></div></section>
      <section className="presentation-features"><div><span className="eyebrow">One template. Every PG.</span><h2>A complete rent operation that still feels like <em>their</em> app.</h2></div><div className="feature-grid"><article><span><IndianRupee size={22} /></span><h3>Ledger, not guesswork</h3><p>The planned ledger separates rent, electricity, deposits, UPI evidence, cash and audited reversals.</p></article><article><span><MessageCircleMore size={22} /></span><h3>WhatsApp as the front door</h3><p>The product direction puts reminders, complaints, move-outs and focused approval links in WhatsApp.</p></article><article><span><Smartphone size={22} /></span><h3>White-label PWA</h3><p>The template is designed for PG-specific names, colors, icons, domains, receipts and bilingual tenant flows.</p></article></div></section>
      <footer className="presentation-footer"><BrandMark /><p>Fictional product demonstration. No real resident or payment data.</p><PoweredBy /></footer>
    </main>
  );
}

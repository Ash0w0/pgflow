import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import { SignupOnboardingForm } from "@/components/signup-onboarding-form";

export const metadata: Metadata = {
  title: "Request PGFlow onboarding",
  description: "Request manual PGFlow onboarding through WhatsApp.",
};

function publicWhatsAppNumber() {
  return (process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
}

export default function SignupPage() {
  return (
    <main className="signup-page">
      <header className="signup-nav">
        <Link className="home-logo" href="/" aria-label="Back to PGFlow homepage">
          <span aria-hidden="true">P</span>
          <strong>PGFlow</strong>
        </Link>
        <Link href="/"><ArrowLeft size={17} /> Back to homepage</Link>
      </header>

      <div className="signup-layout">
        <section className="signup-story" aria-labelledby="signup-title">
          <span className="home-kicker"><MessageCircle size={17} /> WhatsApp-assisted setup</span>
          <h1 id="signup-title">Request onboarding for your PG.</h1>
          <p>Tell us the basics. A PGFlow operator will review the request, provision the workspace manually, and guide the first real operating flow on WhatsApp.</p>
          <div className="signup-start-limit">
            <UsersRound size={26} />
            <div>
              <strong>Begin with up to 2 residents</strong>
              <span>More residents require an upgrade through PGFlow on WhatsApp.</span>
            </div>
          </div>
          <ul>
            <li><Check size={18} /> Your own PG workspace and subdomain</li>
            <li><Check size={18} /> Room, bed, and resident setup</li>
            <li><Check size={18} /> Rent, direct UPI/cash, proof review, and receipts</li>
            <li><ShieldCheck size={18} /> Owner-controlled financial approval</li>
          </ul>
        </section>
        <section className="signup-form-panel" aria-labelledby="signup-form-title">
          <span>Manual PG onboarding request</span>
          <h2 id="signup-form-title">Start the conversation</h2>
          <p>We’ll prepare a message with these details. You review it before anything is sent.</p>
          <SignupOnboardingForm whatsappNumber={publicWhatsAppNumber()} />
          <small>Already have a PGFlow workspace? <Link href="/login">Open it here.</Link></small>
        </section>
      </div>
    </main>
  );
}

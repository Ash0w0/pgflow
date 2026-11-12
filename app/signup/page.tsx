import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import { SignupOnboardingForm } from "@/components/signup-onboarding-form";

export const metadata: Metadata = {
  title: "Create your PG",
  description: "Start a PGFlow workspace with WhatsApp-assisted onboarding.",
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
          <h1 id="signup-title">Create the workspace for your PG.</h1>
          <p>Tell us the basics. PGFlow will continue the setup with you on WhatsApp and prepare the first real operating flow.</p>
          <div className="signup-start-limit">
            <UsersRound size={26} />
            <div>
              <strong>Free for 15 days, everything unlocked</strong>
              <span>Add all your rooms and residents. Continue on a paid plan through PGFlow on WhatsApp.</span>
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
          <span>New PG onboarding</span>
          <h2 id="signup-form-title">Start the conversation</h2>
          <p>We’ll prepare a message with these details. You review it before anything is sent.</p>
          <SignupOnboardingForm whatsappNumber={publicWhatsAppNumber()} />
          <small>Already have a PGFlow workspace? <Link href="/login">Open it here.</Link></small>
        </section>
      </div>
    </main>
  );
}

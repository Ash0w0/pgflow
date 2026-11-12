import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { businessCity, contactEmail, legalEntityLine } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using PGFlow.",
};

export default function TermsPage() {
  const email = contactEmail();
  const operator = legalEntityLine();

  return (
    <LegalPageShell>
      <h1>Terms of Service</h1>
      <p className="legal-updated">Last updated: 10 November 2026</p>

      <p>These terms apply when a PG owner or operator (&quot;you&quot;) uses PGFlow, a service provided by {operator} (&quot;PGFlow&quot;, &quot;we&quot;). By creating a workspace or paying for a plan, you agree to them.</p>

      <h2>1. The service</h2>
      <p>PGFlow is software for managing a paying guest accommodation: rooms and beds, residents, rent invoices, payment review, receipts, reversals, operations and WhatsApp messages. PGFlow is not a bank, payment gateway or payment aggregator. Residents pay you directly by UPI or cash, and we never hold or move your money.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>Keep your login details safe and tell us at once if you suspect misuse.</li>
        <li>You decide who on your team gets access, and you are responsible for what they do in your workspace.</li>
        <li>You must have the right to add the resident data you enter, and you must tell residents that you use PGFlow to manage their stay and payments.</li>
      </ul>

      <h2>3. Plans, payment and refunds</h2>
      <ul>
        <li>Plans are billed yearly in advance. Prices are shown on pgflow.co or in your written offer.</li>
        <li>Founding PG prices apply for the first 2 years of the subscription, as long as it is renewed without a break.</li>
        <li>Founding PGs can cancel within 30 days of payment for a full refund. After that, fees for the current year are not refundable.</li>
        <li>WhatsApp messaging is included at fair-use levels suited to normal rent reminders and receipts.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>Do not use PGFlow to send spam or messages residents have not agreed to receive, to store unlawful content, or to try to access another PG&apos;s data. We may suspend a workspace that puts other customers or residents at risk.</p>

      <h2>5. Your data</h2>
      <p>Your data belongs to you. You can ask for an export at any time, and we will provide it in a common format. When you leave, we delete your data as described in our <a href="/privacy">Privacy Policy</a>, except records we must keep by law.</p>

      <h2>6. Availability and support</h2>
      <p>We work to keep PGFlow available and backed up, but we do not promise it will be free of interruptions. Support is available on WhatsApp and email on working days.</p>

      <h2>7. Liability</h2>
      <p>You remain responsible for checking payments before approving them and for your own accounts and taxes. To the extent the law allows, our total liability for any claim is limited to the fees you paid us in the 12 months before the claim. We are not liable for indirect losses.</p>

      <h2>8. Changes and ending the service</h2>
      <p>We may update these terms and will tell you about material changes in advance. You may stop using PGFlow at any time. These terms are governed by the laws of India, and courts at Patna, Bihar have jurisdiction.</p>

      <h2>9. Contact</h2>
      <p><a href={`mailto:${email}`}>{email}</a>, {businessCity()}.</p>
    </LegalPageShell>
  );
}

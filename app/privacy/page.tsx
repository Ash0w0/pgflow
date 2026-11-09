import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal-page-shell";
import { businessCity, contactEmail, legalBusinessName } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PGFlow collects, uses, stores and protects personal data.",
};

export default function PrivacyPage() {
  const email = contactEmail();
  const operator = legalBusinessName() || "PGFlow";

  return (
    <LegalPageShell>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: 10 November 2026</p>

      <p>This policy explains how {operator} (&quot;PGFlow&quot;, &quot;we&quot;, &quot;us&quot;) handles personal data when you visit pgflow.co, contact us, or use the PGFlow workspace to run a paying guest (PG) accommodation. We follow the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000.</p>

      <h2>1. Who is responsible for what</h2>
      <ul>
        <li><strong>PG owners and their staff.</strong> For account details of owners and staff, PGFlow decides how that data is used.</li>
        <li><strong>Residents.</strong> Resident data is entered and controlled by the PG owner. For that data the PG owner is the Data Fiduciary and PGFlow processes it only on the owner&apos;s instructions, to provide the service.</li>
      </ul>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Owners and staff:</strong> name, phone number, email address, role, login and security records.</li>
        <li><strong>Residents (entered by the PG):</strong> name, phone numbers, emergency contact, address, room and bed details, rent, deposits, invoices, payments and receipts.</li>
        <li><strong>Payment evidence:</strong> UPI references and payment screenshots that residents or staff upload. We do not collect card numbers, bank passwords or UPI PINs, and we never receive the money.</li>
        <li><strong>Messages:</strong> records of WhatsApp messages sent through PGFlow, such as rent reminders and receipts.</li>
        <li><strong>Website enquiries:</strong> what you send us on WhatsApp or email when you ask for a demo.</li>
        <li><strong>Technical data:</strong> basic logs such as IP address, browser and time of access, used for security and reliability.</li>
      </ul>

      <h2>3. How we use it</h2>
      <ul>
        <li>To run the PG workspace: rooms, residents, rent, payment review, receipts and operations.</li>
        <li>To send WhatsApp messages that the PG asks us to send.</li>
        <li>To secure accounts, prevent misuse and keep an audit trail of financial changes.</li>
        <li>To provide support and respond to demo requests.</li>
        <li>To meet legal obligations, such as keeping financial records.</li>
      </ul>
      <p>We do not sell personal data, and we do not use resident data for advertising.</p>

      <h2>4. Who we share it with</h2>
      <p>Only service providers that help us run PGFlow, under contracts that require them to protect the data:</p>
      <ul>
        <li>Supabase (database, authentication and private file storage)</li>
        <li>Vercel (website and application hosting)</li>
        <li>Meta Platforms (WhatsApp Business Platform, for messages)</li>
      </ul>
      <p>Some of these providers may process data outside India, as permitted under Indian law. We may also disclose data when required by law or a valid order of a government authority.</p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Financial records (invoices, payments, receipts): 8 years, as required for books of account.</li>
        <li>Resident personal data: up to 3 years after the resident moves out, unless the PG asks us to delete it sooner and the law allows it.</li>
        <li>Security and audit logs: kept as long as needed to protect the integrity of financial records.</li>
      </ul>

      <h2>6. How we protect it</h2>
      <p>Each PG runs in its own access-controlled workspace. Only people the owner adds can see its data. Payment proofs are stored privately, not on public links. Access is logged, and financial changes are made by reversal so history is kept.</p>

      <h2>7. Your rights</h2>
      <p>You can ask to access, correct or erase your personal data, withdraw consent where processing is based on consent, and nominate another person to exercise your rights. Residents should first contact their PG owner, who controls their data. You can also write to us and we will help. If you are not satisfied with our response, you may approach the Data Protection Board of India.</p>

      <h2>8. Contact and grievances</h2>
      <p>Grievance contact: <a href={`mailto:${email}`}>{email}</a>, {businessCity()}. We aim to respond within 7 working days.</p>

      <h2>9. Changes</h2>
      <p>We will post any changes to this policy on this page and update the date above.</p>
    </LegalPageShell>
  );
}

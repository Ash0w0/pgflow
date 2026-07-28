import { AlertCircle, CheckCircle2, MessageSquare, ShieldCheck } from "lucide-react";

export function WhatsAppSettingsCard({
  configured,
  demoMode,
}: {
  configured: boolean;
  ownerPhone: string | null;
  demoMode: boolean;
}) {
  return (
    <section className="panel whatsapp-settings-card" aria-labelledby="whatsapp-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">WhatsApp communications</span>
          <h2 id="whatsapp-settings-title">PGFlow-owned WhatsApp</h2>
          <p>Consent-aware reminders, owner actions, receipts, service updates, and Monday reports.</p>
        </div>
        <span className="owner-invite-icon"><MessageSquare size={20} /></span>
      </div>
      <div className={`setup-feedback ${configured ? "success" : "error"}`}>
        {configured ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
        <span>
          <strong>{demoMode ? "Simulation only" : configured ? "Delivery subsystem configured" : "Delivery disabled"}</strong>
          <small>{configured
            ? "Messages still require contact consent and the exact English/Hindi Meta template to be approved."
            : "An operator must configure the platform connection; PGFlow will not simulate production sends."}</small>
        </span>
      </div>
      <div className="password-security-note">
        <ShieldCheck size={17} />
        <span>Recipients, amounts, links, language, and templates are resolved on the server. Owners cannot send arbitrary payloads.</span>
      </div>
    </section>
  );
}

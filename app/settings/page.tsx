import { GenericSection } from "@/components/generic-section";
import { PasswordChangeCard } from "@/components/password-change-card";
import { requireStaffPage } from "@/lib/page-authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { UpiSettingsCard } from "@/components/upi-settings-card";
import { BrandingSettingsCard } from "@/components/branding-settings-card";
import { WhatsAppSettingsCard } from "@/components/whatsapp-settings-card";
import { AppShell } from "@/components/app-shell";
import { Settings2, ShieldCheck } from "lucide-react";

export default async function Page() {
  const authorization = await requireStaffPage(["owner"]);
  let upi = { upiId: "", payeeName: "", notePrefix: "RENT", hasUploadedQr: false };
  if (authorization.mode === "production" && authorization.actor.propertyId) {
    const { data, error } = await getSupabaseAdmin().from("properties").select("upi_id,upi_payee_name,upi_note_prefix,upi_qr_object_key").eq("organization_id", authorization.actor.organizationId).eq("id", authorization.actor.propertyId).single();
    if (error) throw new Error("UPI configuration could not be loaded.");
    upi = { upiId: data.upi_id, payeeName: data.upi_payee_name, notePrefix: data.upi_note_prefix, hasUploadedQr: Boolean(data.upi_qr_object_key) };
  }
  if (authorization.mode === "demo") {
    return (
      <AppShell demoMode={true}>
        <div className="page-stack live-settings-page">
          <section className="page-heading">
            <div>
              <div className="demo-kicker"><Settings2 size={14}/> Owner controls</div>
              <h1>Property settings</h1>
              <p>Manage branding, payment destination, WhatsApp communications, and account security.</p>
            </div>
          </section>
          <BrandingSettingsCard />
          <WhatsAppSettingsCard />
          <UpiSettingsCard initial={upi} />
          <PasswordChangeCard demoMode={true} />
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell demoMode={false}>
      <div className="page-stack live-settings-page">
        <section className="page-heading">
          <div>
            <div className="demo-kicker"><Settings2 size={14}/> Owner controls</div>
            <h1>Property settings</h1>
            <p>Manage branding, payment destination, WhatsApp communications, and account security for this PG.</p>
          </div>
        </section>
        <div className="setup-safety-strip">
          <ShieldCheck size={17}/>
          <span><strong>Sensitive changes require your password.</strong> UPI and password changes are audited.</span>
        </div>
        <BrandingSettingsCard />
        <WhatsAppSettingsCard />
        <UpiSettingsCard initial={upi}/>
        <PasswordChangeCard demoMode={false}/>
      </div>
    </AppShell>
  );
}


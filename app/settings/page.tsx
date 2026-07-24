import { PasswordChangeCard } from "@/components/password-change-card";
import { requireStaffPage } from "@/lib/page-authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { UpiSettingsCard } from "@/components/upi-settings-card";
import { BrandingSettingsCard, type BrandThemeSettings } from "@/components/branding-settings-card";
import { WhatsAppSettingsCard } from "@/components/whatsapp-settings-card";
import { AppShell } from "@/components/app-shell";
import { DEFAULT_BRAND_ACCENT, DEFAULT_BRAND_PRIMARY, safeColor } from "@/lib/branding";
import { Settings2, ShieldCheck } from "lucide-react";

export default async function Page() {
  const authorization = await requireStaffPage(["owner"]);
  const demoMode = authorization.mode === "demo";

  let upi = { upiId: "", payeeName: "", notePrefix: "RENT", hasUploadedQr: false };
  let brand: BrandThemeSettings = { primaryColor: DEFAULT_BRAND_PRIMARY, accentColor: DEFAULT_BRAND_ACCENT };
  let ownerPhone: string | null = null;

  if (authorization.mode === "production") {
    const admin = getSupabaseAdmin();

    if (authorization.actor.propertyId) {
      const { data, error } = await admin
        .from("properties")
        .select("upi_id,upi_payee_name,upi_note_prefix,upi_qr_object_key")
        .eq("organization_id", authorization.actor.organizationId)
        .eq("id", authorization.actor.propertyId)
        .single();
      if (error) throw new Error("UPI configuration could not be loaded.");
      upi = {
        upiId: data.upi_id,
        payeeName: data.upi_payee_name,
        notePrefix: data.upi_note_prefix,
        hasUploadedQr: Boolean(data.upi_qr_object_key),
      };
    }

    const { data: theme, error: themeError } = await admin
      .from("brand_themes")
      .select("primary_color,accent_color")
      .eq("organization_id", authorization.actor.organizationId)
      .maybeSingle();
    if (themeError) throw new Error("Branding configuration could not be loaded.");
    if (theme) {
      brand = {
        primaryColor: safeColor(theme.primary_color, DEFAULT_BRAND_PRIMARY),
        accentColor: safeColor(theme.accent_color, DEFAULT_BRAND_ACCENT),
      };
    }

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    ownerPhone = user?.phone ?? null;
  }

  // A live WhatsApp dispatch needs Meta credentials; without them the card must not claim readiness.
  const whatsappConfigured = demoMode || Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  return (
    <AppShell demoMode={demoMode}>
      <div className="page-stack live-settings-page">
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <Settings2 size={14} /> Owner controls
            </div>
            <h1>Property settings</h1>
            <p>Manage branding, payment destination, WhatsApp communications, and account security for this PG.</p>
          </div>
        </section>
        {!demoMode && (
          <div className="setup-safety-strip">
            <ShieldCheck size={17} />
            <span>
              <strong>Sensitive changes require your password.</strong> UPI and password changes are audited.
            </span>
          </div>
        )}
        <BrandingSettingsCard initial={brand} demoMode={demoMode} />
        <WhatsAppSettingsCard configured={whatsappConfigured} ownerPhone={ownerPhone} demoMode={demoMode} />
        <UpiSettingsCard initial={upi} />
        <PasswordChangeCard demoMode={demoMode} />
      </div>
    </AppShell>
  );
}

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BrandMark, PoweredBy } from "@/components/brand-mark";
import { RecoveryForm } from "@/components/recovery-form";
import { hostnameFromHeaders, resolvePublicBrandContextForHostname } from "@/lib/tenancy";

export default async function RecoverPage() {
  const hostname = hostnameFromHeaders(await headers());
  if (!hostname) notFound();
  const tenant = await resolvePublicBrandContextForHostname(hostname).catch(() => null);
  if (!tenant || tenant.demoMode || ["suspended", "archived"].includes(tenant.state)) notFound();

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <BrandMark />
        <div>
          <span className="demo-kicker">Secure owner recovery</span>
          <h1>Return to your<br /><em>PG workspace.</em></h1>
          <p>Use the short-lived recovery details personally shared by the platform operator.</p>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <span className="eyebrow">One-time recovery</span>
          <h2>Choose a new private password</h2>
          <p>The recovery credential is not an OTP and cannot be used as a normal login password.</p>
          <RecoveryForm />
          <PoweredBy />
        </div>
      </section>
    </main>
  );
}

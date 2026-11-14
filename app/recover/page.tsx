import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BrandMark, PoweredBy } from "@/components/brand-mark";
import { RecoveryForm } from "@/components/recovery-form";
import { normalizeHostname } from "@/lib/branding";
import { isDemoRuntime } from "@/lib/runtime";
import { hostnameFromHeaders, resolvePublicBrandContextForHostname } from "@/lib/tenancy";

export default async function RecoverPage() {
  const demoMode = isDemoRuntime();
  const hostname = hostnameFromHeaders(await headers());
  const operatorHostname = normalizeHostname(process.env.OPERATOR_HOSTNAME ?? null);
  const isOperatorHost = Boolean(operatorHostname && hostname === operatorHostname);

  let tenant = null;
  if (!demoMode && !isOperatorHost) {
    if (!hostname) notFound();
    tenant = await resolvePublicBrandContextForHostname(hostname).catch(() => null);
    if (!tenant || tenant.demoMode || ["suspended", "archived"].includes(tenant.state)) notFound();
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <BrandMark />
        <div>
          <span className="demo-kicker">{isOperatorHost ? "Operator security" : "Secure recovery"}</span>
          <h1>Return to your<br /><em>PG workspace.</em></h1>
          <p>{isOperatorHost ? "Platform operator password recovery and credential administration." : "Use the short-lived recovery details personally shared by the platform operator."}</p>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          {isOperatorHost ? (
            <div className="operator-recovery-info" style={{ width: "100%" }}>
              <span className="eyebrow">Platform Operator Recovery</span>
              <h2>Operator Password Reset</h2>
              <p style={{ marginTop: "12px", marginBottom: "20px", color: "var(--ink-soft)", fontSize: "13px", lineHeight: "1.6" }}>
                Operator passwords are not reset from this page. Use the documented server procedure, which needs database access.
              </p>
              <a href="/login" className="button button-primary button-full" style={{ textAlign: "center" }}>
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              <span className="eyebrow">One-time recovery</span>
              <h2>Choose a new private password</h2>
              <p>The recovery credential is not an OTP and cannot be used as a normal login password.</p>
              <RecoveryForm />
              <p style={{ marginTop: "16px", color: "var(--ink-faint)", fontSize: "12px", lineHeight: "1.5" }}>
                Manager or resident? Ask your PG owner. They can give you a new one-time password from their Settings or Residents page.
              </p>
            </>
          )}
          <PoweredBy />
        </div>
      </section>
    </main>
  );
}

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
              <p style={{ marginTop: "12px", color: "var(--ink-soft)", fontSize: "13px", lineHeight: "1.6" }}>
                Platform operators can reset their password securely via Supabase SQL Editor or using the server CLI utility:
              </p>
              <div style={{ margin: "16px 0", padding: "14px", background: "var(--surface-soft)", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <code style={{ fontSize: "11px", wordBreak: "break-all" }}>
                  node scripts/reset-operator-password.mjs &quot;YourNewPassword123!&quot;
                </code>
              </div>
              <p style={{ color: "var(--ink-soft)", fontSize: "12px", marginBottom: "8px" }}>
                Or execute the SQL statement in your Supabase SQL Editor:
              </p>
              <div style={{ margin: "8px 0 20px", padding: "12px", background: "var(--surface-soft)", borderRadius: "10px", border: "1px solid var(--line)" }}>
                <pre style={{ fontSize: "11px", whiteSpace: "pre-wrap", margin: 0, fontFamily: "monospace" }}>
{`UPDATE auth.users
SET encrypted_password = crypt('YourNewPassword123!', gen_salt('bf'))
WHERE id IN (SELECT auth_user_id FROM public.platform_operators);`}
                </pre>
              </div>
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
            </>
          )}
          <PoweredBy />
        </div>
      </section>
    </main>
  );
}

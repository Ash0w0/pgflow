import { Clock3, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BrandMark, PoweredBy } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { WorkspaceFinder } from "@/components/workspace-finder";
import { normalizeHostname } from "@/lib/branding";
import {
  hasActivatedManualOwner,
  hasPendingManualOwnerCredential,
} from "@/lib/manual-owner-activation";
import { isDemoRuntime } from "@/lib/runtime";
import {
  hostnameFromHeaders,
  isOperationalTenant,
  resolvePublicBrandContextForHostname,
} from "@/lib/tenancy";
import { isPlatformLoginHostname } from "@/lib/workspace-login";

export default async function LoginPage() {
  const demoMode = isDemoRuntime();
  let workspaceSetupPending = false;
  let manualOwnerLogin = false;
  let platformDomain = "";
  let platformLogin = false;

  if (!demoMode) {
    const hostname = hostnameFromHeaders(await headers());
    const operatorHostname = normalizeHostname(process.env.OPERATOR_HOSTNAME ?? null);
    platformDomain = normalizeHostname(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? null);

    if (!hostname) notFound();

    platformLogin = isPlatformLoginHostname(hostname, platformDomain);

    if ((!operatorHostname || hostname !== operatorHostname) && !platformLogin) {
      const tenant = await resolvePublicBrandContextForHostname(hostname).catch(() => null);

      if (!tenant) notFound();

      if (tenant.state === "draft") {
        const [hasPendingOwner, hasActivatedOwner] = await Promise.all([
          hasPendingManualOwnerCredential(tenant.organizationId),
          hasActivatedManualOwner(tenant.organizationId),
        ]);
        manualOwnerLogin = hasPendingOwner;
        workspaceSetupPending = !hasPendingOwner && !hasActivatedOwner;
      } else if (!isOperationalTenant(tenant)) {
        notFound();
      }
    }
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <BrandMark />
        <div>
          <span className="demo-kicker">{demoMode ? "Fictional demonstration" : "PG operations workspace"}</span>
          <h1>Your PG,<br /><em>beautifully run.</em></h1>
          <p>Rent, rooms and resident operations—kept in flow through one branded workspace and WhatsApp.</p>
        </div>
        <div className="login-proof">
          <ShieldCheck size={20} />
          <span>
            <strong>{demoMode ? "Demo-safe by design" : "Organization-scoped access"}</strong>
            <small>{demoMode ? "No real resident or payment data" : "Sign in only from your PG workspace"}</small>
          </span>
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          {platformLogin ? (
            <>
              <span className="eyebrow">Find your workspace</span>
              <h2>Open your PG workspace</h2>
              <p>Enter the workspace name from the login address shared by your PG.</p>
              <WorkspaceFinder platformDomain={platformDomain} />
            </>
          ) : workspaceSetupPending ? (
            <div className="workspace-setup-state" role="status">
              <span className="workspace-setup-icon" aria-hidden="true"><Clock3 size={24} /></span>
              <span className="eyebrow">Workspace preparation</span>
              <h2>Workspace setup in progress</h2>
              <p>
                Your branded PG workspace is reserved. Owner activation and property data setup are
                still pending. Sign-in will become available once setup is complete.
              </p>
            </div>
          ) : (
            <>
              <span className="eyebrow">{demoMode ? "Explore the product" : "Welcome back"}</span>
              <h2>{demoMode ? "Explore Nivasa" : manualOwnerLogin ? "Set up your owner account" : "Sign in to your workspace"}</h2>
              <p>{demoMode
                ? "Choose a fictional role to explore the template."
                : manualOwnerLogin
                  ? "Use the phone number and temporary password shared with you. You will create a private password next."
                  : "Use the phone number and password assigned to your account."}</p>
              <LoginForm demoMode={demoMode} manualOwnerLogin={manualOwnerLogin} />
            </>
          )}
          <PoweredBy />
        </div>
      </section>
    </main>
  );
}

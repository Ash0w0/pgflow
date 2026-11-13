import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PasswordChangeCard } from "@/components/password-change-card";
import { ResidentPassword } from "@/components/resident-app/resident-password";
import { requirePgPage } from "@/lib/page-authorization";
import { mustChangePassword } from "@/lib/password-change-flag";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set your password" };

export default async function AccountPasswordPage() {
  const authorization = await requirePgPage(["owner", "manager", "tenant"], { allowPendingPasswordChange: true });
  const demoMode = authorization.mode === "demo";

  let firstLogin = false;
  if (!demoMode) {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    firstLogin = mustChangePassword(user);
  }

  if (authorization.mode === "production" && authorization.actor.role === "tenant") {
    return <ResidentPassword firstLogin={firstLogin} />;
  }

  return (
    <AppShell demoMode={demoMode} role={authorization.mode === "production" ? authorization.actor.role : undefined}>
      <div className="page-stack">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><KeyRound size={14} /> Account security</div>
          <h1>{firstLogin ? "Choose your private password" : "Change your password"}</h1>
          <p>
            {firstLogin
              ? "You signed in with a one-time password. Enter it as your current password, then choose a private password only you know. You will sign in again afterwards."
              : "Confirm your current password, then choose a new one. Other sessions are signed out."}
          </p>
        </div>
      </section>
      <PasswordChangeCard demoMode={demoMode} />
      </div>
    </AppShell>
  );
}

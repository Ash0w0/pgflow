"use client";

import { CheckCircle2, KeyRound, RefreshCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isStrongOwnerPassword, OWNER_PASSWORD_MAX_LENGTH, OWNER_PASSWORD_MIN_LENGTH } from "@/lib/passwords";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function PasswordChangeCard({ demoMode }: { demoMode: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || demoMode) return;
    if (newPassword !== confirmation) {
      setError("The two new passwords do not match.");
      return;
    }
    if (!isStrongOwnerPassword(newPassword)) {
      setError("Use 12–128 characters with uppercase, lowercase, a number, and a symbol.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation: confirmation }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.changed !== true) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Your password could not be changed.");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setComplete(true);
      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel owner-invitation-panel" aria-labelledby="account-security-title">
      <div className="panel-head">
        <div><span className="eyebrow">Account security</span><h2 id="account-security-title">Change your private password</h2><p>Confirm your current password, then choose a new one. Other signed-in sessions will be closed.</p></div>
        <span className="owner-invite-icon"><KeyRound size={19} /></span>
      </div>
      {demoMode ? (
        <div className="owner-invite-boundary owner-manual-boundary"><ShieldCheck size={17} /><span>Password changes are disabled in the fictional demonstration.</span></div>
      ) : complete ? (
        <div className="live-operator-feedback feedback-success" role="status"><CheckCircle2 size={17} /><span>Password changed. Returning you to sign in…</span></div>
      ) : (
        <form className="modal-form owner-reset-form" onSubmit={submit} aria-busy={submitting}>
          <label htmlFor="current-account-password">Current password<input id="current-account-password" type="password" autoComplete="current-password" minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={submitting} /></label>
          <div className="form-row">
            <label htmlFor="new-account-password">New password<input id="new-account-password" type="password" autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={submitting} /></label>
            <label htmlFor="confirm-account-password">Confirm new password<input id="confirm-account-password" type="password" autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={submitting} /></label>
          </div>
          <div className="password-security-note"><ShieldCheck size={17} /><span>PGFlow never stores either password in the application database or audit log.</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : <KeyRound size={17} />}
            {submitting ? "Changing password…" : "Change password and sign out"}
          </button>
        </form>
      )}
    </section>
  );
}

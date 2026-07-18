"use client";

import Link from "next/link";
import { CheckCircle2, KeyRound, Phone, RefreshCcw, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { isStrongOwnerPassword, OWNER_PASSWORD_MAX_LENGTH, OWNER_PASSWORD_MIN_LENGTH } from "@/lib/passwords";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function RecoveryForm() {
  const [phone, setPhone] = useState("");
  const [credential, setCredential] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (newPassword !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }
    if (!isStrongOwnerPassword(newPassword)) {
      setError("Use 12–128 characters with uppercase, lowercase, a number, and a symbol.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/recover-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          credential,
          newPassword,
          passwordConfirmation: confirmation,
          recoveryRequestId: requestId,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.recovered !== true) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Your password could not be recovered. Please try again.");
      }
      setPhone("");
      setCredential("");
      setNewPassword("");
      setConfirmation("");
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be recovered. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) {
    return (
      <div className="password-change-success" role="status">
        <span className="workspace-setup-icon"><CheckCircle2 aria-hidden="true" size={24} /></span>
        <h3>Your new password is active</h3>
        <p>The recovery credential no longer works, and previous sign-in sessions have been closed.</p>
        <Link className="button button-primary button-full" href="/login">Return to sign in</Link>
      </div>
    );
  }

  return (
    <form className="login-form password-change-form" onSubmit={submit} aria-busy={submitting}>
      <label htmlFor="recovery-phone">
        Phone number
        <div className="input-with-icon"><Phone size={17} /><input id="recovery-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={submitting} /></div>
      </label>
      <label htmlFor="recovery-credential">
        One-time recovery credential
        <div className="input-with-icon"><KeyRound size={17} /><input id="recovery-credential" type="password" autoComplete="one-time-code" minLength={20} maxLength={20} value={credential} onChange={(event) => setCredential(event.target.value)} required disabled={submitting} /></div>
      </label>
      <label htmlFor="recovery-new-password">
        New private password
        <div className="input-with-icon"><KeyRound size={17} /><input id="recovery-new-password" type="password" autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={submitting} /></div>
      </label>
      <label htmlFor="recovery-confirm-password">
        Confirm new password
        <div className="input-with-icon"><KeyRound size={17} /><input id="recovery-confirm-password" type="password" autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={submitting} /></div>
      </label>
      <div className="password-security-note"><ShieldCheck size={17} /><span>Your one-time credential never becomes a login session and is erased after recovery.</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary button-full" type="submit" disabled={submitting}>
        {submitting ? <RefreshCcw className="spin" size={17} /> : <KeyRound size={17} />}
        {submitting ? "Securing your account…" : "Set my new password"}
      </button>
      <Link className="button button-quiet button-full" href="/login">Back to sign in</Link>
    </form>
  );
}

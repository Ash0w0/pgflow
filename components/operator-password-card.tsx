"use client";

import { CheckCircle2, Eye, EyeOff, KeyRound, RefreshCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isStrongOwnerPassword, OWNER_PASSWORD_MAX_LENGTH, OWNER_PASSWORD_MIN_LENGTH } from "@/lib/passwords";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function VisibilityButton({
  visible,
  onToggle,
  label,
  disabled,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      className="password-visibility-button"
      type="button"
      onClick={onToggle}
      aria-label={`${visible ? "Hide" : "Show"} ${label}`}
      aria-pressed={visible}
      disabled={disabled}
    >
      {visible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
    </button>
  );
}

export function OperatorPasswordCard() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
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
      const response = await fetch("/api/auth/operator-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation: confirmation }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.changed !== true) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "Your operator password could not be changed.");
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
      setError(caught instanceof Error ? caught.message : "Your operator password could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel owner-invitation-panel" aria-labelledby="operator-password-title">
      <div className="panel-head">
        <div><span className="eyebrow">Immediate security action</span><h2 id="operator-password-title">Change the exposed operator password</h2><p>Choose a completely new password. Successful rotation closes every existing operator session.</p></div>
        <span className="owner-invite-icon"><KeyRound size={19} /></span>
      </div>
      <div className="owner-invite-boundary owner-manual-boundary"><ShieldCheck size={17} /><span><strong>Passwords remain private.</strong> They are sent only to the protected server endpoint and are never stored in PGFlow or its audit logs.</span></div>
      {complete ? (
        <div className="live-operator-feedback feedback-success" role="status"><CheckCircle2 size={17} /><span>Password changed. Returning you to sign in…</span></div>
      ) : (
        <form className="modal-form owner-reset-form" onSubmit={submit} aria-busy={submitting}>
          <label htmlFor="current-operator-password">Current exposed password<div className="input-with-icon"><KeyRound size={17} /><input id="current-operator-password" type={showCurrent ? "text" : "password"} autoComplete="current-password" minLength={8} maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required disabled={submitting} /><VisibilityButton visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} label="current password" disabled={submitting} /></div></label>
          <div className="form-row">
            <label htmlFor="new-operator-password">New private password<div className="input-with-icon"><KeyRound size={17} /><input id="new-operator-password" type={showNew ? "text" : "password"} autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required disabled={submitting} /><VisibilityButton visible={showNew} onToggle={() => setShowNew((value) => !value)} label="new password" disabled={submitting} /></div></label>
            <label htmlFor="confirm-operator-password">Confirm new password<div className="input-with-icon"><KeyRound size={17} /><input id="confirm-operator-password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" minLength={OWNER_PASSWORD_MIN_LENGTH} maxLength={OWNER_PASSWORD_MAX_LENGTH} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required disabled={submitting} /><VisibilityButton visible={showConfirmation} onToggle={() => setShowConfirmation((value) => !value)} label="confirmed password" disabled={submitting} /></div></label>
          </div>
          <p className="password-requirements">12–128 characters · uppercase · lowercase · number · symbol · do not reuse the exposed password</p>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" type="submit" disabled={submitting}>
            {submitting ? <RefreshCcw className="spin" size={17} /> : <KeyRound size={17} />}
            {submitting ? "Rotating password…" : "Change password and close all sessions"}
          </button>
        </form>
      )}
    </section>
  );
}

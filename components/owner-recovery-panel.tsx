"use client";

import { AlertCircle, Check, Clipboard, KeyRound, MessageCircle, RefreshCcw, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { OwnerInvitationOrganization } from "./owner-invitation-panel";

type RecoveryResult = {
  recoveryId: string;
  organizationId: string;
  displayName: string;
  phone: string;
  maskedPhone: string;
  credential: string;
  expiresAt: string;
  recoveryUrl: string;
  organizationName: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRecoveryResult(value: unknown): value is { recovery: Omit<RecoveryResult, "organizationName"> } {
  if (!isRecord(value) || !isRecord(value.recovery)) return false;
  const recovery = value.recovery;
  return typeof recovery.recoveryId === "string"
    && typeof recovery.organizationId === "string"
    && typeof recovery.displayName === "string"
    && typeof recovery.phone === "string"
    && typeof recovery.maskedPhone === "string"
    && typeof recovery.credential === "string"
    && recovery.credential.length === 20
    && typeof recovery.expiresAt === "string"
    && typeof recovery.recoveryUrl === "string";
}

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(Date.parse(value)) + " IST";
}

function recoveryMessage(result: RecoveryResult) {
  return [
    `${result.organizationName} owner password recovery`,
    "",
    `Recovery page: ${result.recoveryUrl}`,
    `Phone: ${result.phone}`,
    `One-time recovery credential: ${result.credential}`,
    `Expires: ${formatExpiry(result.expiresAt)}`,
    "",
    "Open the recovery page, enter these details, and choose a new private password. This credential works once. Do not share it with anyone else.",
  ].join("\n");
}

export function OwnerRecoveryPanel({ organizations }: { organizations: OwnerInvitationOrganization[] }) {
  const eligible = organizations.filter((organization) => (
    organization.hostname
    && organization.ownerInvitation?.credentialState === "activated"
    && !["suspended", "archived"].includes(organization.state)
  ));
  const [organizationId, setOrganizationId] = useState("");
  const [manualPhoneConfirmed, setManualPhoneConfirmed] = useState(false);
  const [operatorPassword, setOperatorPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = eligible.find((organization) => organization.id === organizationId) ?? eligible[0] ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || submitting || !manualPhoneConfirmed || operatorPassword.length < 8) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const response = await fetch("/api/owner-password-recovery", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: selected.id,
          manualPhoneConfirmed: true,
          operatorPassword,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecoveryResult(payload)) {
        throw new Error(isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The recovery credential could not be created.");
      }
      setResult({ ...payload.recovery, organizationName: selected.name });
      setOperatorPassword("");
      setManualPhoneConfirmed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The recovery credential could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRecovery() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(recoveryMessage(result));
      setCopied(true);
    } catch {
      setError("The browser could not copy the recovery details. Select them manually instead.");
    }
  }

  const shareUrl = result
    ? `https://wa.me/${result.phone.replace(/\D/g, "")}?text=${encodeURIComponent(recoveryMessage(result))}`
    : null;

  return (
    <article className="panel owner-invitation-panel owner-recovery-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Manual account recovery</span>
          <h2>Help an owner who forgot their password</h2>
          <p>After confirming the owner yourself, create a one-time recovery credential that can be shared manually on WhatsApp.</p>
        </div>
        <span className="owner-invite-icon"><KeyRound aria-hidden="true" size={19} /></span>
      </div>

      <div className="owner-invite-boundary owner-manual-boundary">
        <ShieldCheck aria-hidden="true" size={17} />
        <span><strong>No OTP and no automatic reset.</strong> Your password and manual identity confirmation are required before a recovery credential is issued.</span>
      </div>

      {eligible.length === 0 ? (
        <div className="live-registry-empty">No active PG owner account is available for password recovery yet.</div>
      ) : (
        <form className="modal-form owner-reset-form" onSubmit={submit} aria-busy={submitting}>
          <label htmlFor="recovery-organization">
            Active owner account
            <select
              id="recovery-organization"
              value={selected?.id ?? ""}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setManualPhoneConfirmed(false);
                setOperatorPassword("");
                setError(null);
              }}
              disabled={submitting}
              required
            >
              {eligible.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} · {organization.ownerInvitation?.displayName} · {organization.ownerInvitation?.maskedPhone}
                </option>
              ))}
            </select>
          </label>

          <label className="owner-manual-confirmation" htmlFor="recovery-phone-confirmed">
            <input
              id="recovery-phone-confirmed"
              type="checkbox"
              checked={manualPhoneConfirmed}
              onChange={(event) => setManualPhoneConfirmed(event.target.checked)}
              required
              disabled={submitting}
            />
            <span>
              <strong>I personally confirmed the owner&apos;s identity and phone number.</strong>
              <small>This manual check replaces OTP verification and must happen before every recovery.</small>
            </span>
          </label>

          <label htmlFor="recovery-operator-password">
            Confirm your operator password
            <input
              id="recovery-operator-password"
              type="password"
              value={operatorPassword}
              onChange={(event) => setOperatorPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
          </label>

          <button
            className="button button-secondary button-full"
            type="submit"
            disabled={submitting || !manualPhoneConfirmed || operatorPassword.length < 8}
          >
            <RefreshCcw className={submitting ? "spin" : ""} size={17} />
            {submitting ? "Creating recovery credential…" : "Create one-time recovery credential"}
          </button>
        </form>
      )}

      {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}

      {result && (
        <div className="owner-invite-result owner-credentials-result">
          <div role="status"><KeyRound size={18} /><span><strong>Recovery ready for {result.displayName}</strong><small>{result.maskedPhone} · visible only now</small></span></div>
          <dl className="owner-credential-grid">
            <div><dt>Recovery page</dt><dd className="owner-credential-url">{result.recoveryUrl}</dd></div>
            <div className="owner-password-row"><dt>One-time credential</dt><dd><code>{result.credential}</code></dd></div>
            <div><dt>Expires</dt><dd>{formatExpiry(result.expiresAt)}</dd></div>
          </dl>
          <div className="owner-credential-actions">
            <button className="button button-secondary" type="button" onClick={() => void copyRecovery()}>
              {copied ? <Check size={16} /> : <Clipboard size={16} />}
              {copied ? "Recovery copied" : "Copy recovery"}
            </button>
            {shareUrl && (
              <a className="button button-primary" href={shareUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> Share on WhatsApp
              </a>
            )}
          </div>
          <p>WhatsApp opens a draft. Check the recipient and press Send yourself; PGFlow does not send it automatically.</p>
        </div>
      )}
    </article>
  );
}

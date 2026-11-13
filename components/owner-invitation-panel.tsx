"use client";

import {
  AlertCircle,
  Check,
  Clipboard,
  KeyRound,
  MessageCircle,
  RefreshCcw,
  UserRoundCheck,
} from "lucide-react";
import { useState, type FormEvent } from "react";

export type OwnerInvitationOrganization = {
  id: string;
  name: string;
  hostname: string | null;
  state: string;
  ownerInvitation: {
    id: string;
    displayName: string;
    maskedPhone: string;
    state: string;
    expiresAt?: string | null;
    credentialState?: string | null;
    temporaryPasswordExpiresAt?: string | null;
  } | null;
};

type OwnerAccount = {
  invitationId: string;
  organizationId: string;
  displayName: string;
  phone: string;
  maskedPhone: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
  loginUrl: string;
  credentialState: "temporary";
};

type PreparedOwnerAccount = OwnerAccount & {
  organizationName: string;
};

type OwnerAccountResult = {
  ownerAccount: OwnerAccount;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOwnerAccountResult(value: unknown): value is OwnerAccountResult {
  if (!isRecord(value) || !isRecord(value.ownerAccount)) return false;
  const account = value.ownerAccount;
  return typeof account.invitationId === "string"
    && typeof account.organizationId === "string"
    && typeof account.displayName === "string"
    && typeof account.phone === "string"
    && typeof account.maskedPhone === "string"
    && typeof account.temporaryPassword === "string"
    && account.temporaryPassword.length > 0
    && typeof account.temporaryPasswordExpiresAt === "string"
    && typeof account.loginUrl === "string"
    && account.credentialState === "temporary";
}

function formatExpiry(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "the expiry time shown by the platform";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(timestamp) + " IST";
}

function credentialMessage(account: PreparedOwnerAccount) {
  return [
    `${account.organizationName} owner login`,
    "",
    `Login: ${account.loginUrl}`,
    `Phone: ${account.phone}`,
    `Temporary password: ${account.temporaryPassword}`,
    `Expires: ${formatExpiry(account.temporaryPasswordExpiresAt)}`,
    "",
    "You must create a new private password when you first sign in. This temporary password stops working after that. Please do not share these credentials with anyone else.",
  ].join("\n");
}

function whatsappShareUrl(account: PreparedOwnerAccount) {
  const digits = account.phone.replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(credentialMessage(account))}`;
}

function OwnerCredentialsResult({
  account,
  onCopyError,
}: {
  account: PreparedOwnerAccount;
  onCopyError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = whatsappShareUrl(account);

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(credentialMessage(account));
      setCopied(true);
    } catch {
      onCopyError("The browser could not copy the credentials. Select the details manually instead.");
    }
  }

  return (
    <div className="owner-invite-result owner-credentials-result">
      <div role="status" aria-live="polite">
        <UserRoundCheck aria-hidden="true" size={18} />
        <span>
          <strong>Temporary owner login ready for {account.displayName}</strong>
          <small>{account.maskedPhone} · password change required at first sign-in</small>
        </span>
      </div>

      <div className="owner-credential-notice">
        <AlertCircle aria-hidden="true" size={16} />
        <span><strong>The temporary password is visible only now.</strong> Copy or share it before leaving or refreshing this page. It is not saved in readable form by the platform.</span>
      </div>

      <dl className="owner-credential-grid">
        <div><dt>PG</dt><dd>{account.organizationName}</dd></div>
        <div><dt>Login address</dt><dd className="owner-credential-url">{account.loginUrl}</dd></div>
        <div><dt>Owner phone</dt><dd>{account.phone}</dd></div>
        <div className="owner-password-row"><dt>Temporary password</dt><dd><code>{account.temporaryPassword}</code></dd></div>
        <div><dt>Expires</dt><dd>{formatExpiry(account.temporaryPasswordExpiresAt)}</dd></div>
      </dl>

      <div className="owner-credential-actions">
        <button className="button button-secondary" type="button" onClick={() => void copyCredentials()}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}
          {copied ? "Credentials copied" : "Copy credentials"}
        </button>
        {shareUrl && (
          <a
            className="button button-primary"
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share owner credentials on WhatsApp (opens in a new tab)"
          >
            <MessageCircle size={16} />
            Share on WhatsApp
          </a>
        )}
      </div>
      <p>WhatsApp will open with a prepared message. Check the recipient and message, then press Send yourself; the platform never sends it automatically.</p>
    </div>
  );
}

export function OwnerInvitationPanel({
  organizations,
  onPrepared,
}: {
  organizations: OwnerInvitationOrganization[];
  onPrepared: () => Promise<void>;
}) {
  const eligible = organizations.filter((organization) => (
    organization.state === "draft"
    && organization.hostname
    && (
      !organization.ownerInvitation?.credentialState
      || organization.ownerInvitation.credentialState === "not_issued"
    )
  ));
  const resettable = organizations.filter((organization) => (
    organization.state === "draft"
    && organization.hostname
    && ["temporary", "temporary_password_expired"].includes(
      organization.ownerInvitation?.credentialState ?? "",
    )
  ));
  const [organizationId, setOrganizationId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [manualPhoneConfirmed, setManualPhoneConfirmed] = useState(false);
  const [operatorPassword, setOperatorPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetOrganizationId, setResetOrganizationId] = useState("");
  const [resetPhoneConfirmed, setResetPhoneConfirmed] = useState(false);
  const [resetOperatorPassword, setResetOperatorPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreparedOwnerAccount | null>(null);
  const selectedOrganization = eligible.find((organization) => organization.id === organizationId) ?? eligible[0] ?? null;
  const selectedOrganizationId = selectedOrganization?.id ?? "";
  const selectedResetOrganization = resettable.find((organization) => organization.id === resetOrganizationId) ?? resettable[0] ?? null;
  const selectedResetOrganizationId = selectedResetOrganization?.id ?? "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !selectedOrganization || !manualPhoneConfirmed) return;

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/owner-invitations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedOrganization.id,
          displayName,
          phone,
          manualPhoneConfirmed: true,
          operatorPassword,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isOwnerAccountResult(payload)) {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The owner login could not be created.";
        throw new Error(message);
      }

      setResult({ ...payload.ownerAccount, organizationName: selectedOrganization.name });
      setDisplayName("");
      setPhone("");
      setManualPhoneConfirmed(false);
      setOperatorPassword("");
      await onPrepared();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The owner login could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetTemporaryPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetting || !selectedResetOrganization || !resetPhoneConfirmed) return;

    setResetting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/owner-credentials/reset", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: selectedResetOrganization.id,
          manualPhoneConfirmed: true,
          operatorPassword: resetOperatorPassword,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isOwnerAccountResult(payload)) {
        const message = isRecord(payload) && typeof payload.error === "string"
          ? payload.error
          : "The temporary password could not be regenerated.";
        throw new Error(message);
      }

      setResult({ ...payload.ownerAccount, organizationName: selectedResetOrganization.name });
      setResetPhoneConfirmed(false);
      setResetOperatorPassword("");
      await onPrepared();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The temporary password could not be regenerated.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <article className="panel owner-invitation-panel">
      <div className="panel-head">
        <div>
          <h2>Owner login</h2>
          <p>Create a one-time password for the PG owner. They choose their own password the first time they sign in.</p>
        </div>
        <span className="owner-invite-icon"><KeyRound aria-hidden="true" size={19} /></span>
      </div>

      {eligible.length === 0 ? (
        <div className="live-registry-empty">
          <span>{resettable.length > 0
            ? "Every current draft PG already has a temporary owner login. Use the controlled reset below only when necessary."
            : "Create a draft PG shell before creating its owner login."}</span>
        </div>
      ) : (
        <form className="modal-form owner-invite-form" onSubmit={submit} aria-busy={submitting}>
          <label htmlFor="owner-invite-organization">
            PG workspace
            <select
              id="owner-invite-organization"
              value={selectedOrganizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setDisplayName("");
                setPhone("");
                setManualPhoneConfirmed(false);
                setOperatorPassword("");
                setError(null);
              }}
              disabled={submitting}
              required
            >
              {eligible.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label htmlFor="owner-invite-name">
              Owner name
              <input
                id="owner-invite-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={2}
                maxLength={120}
                autoComplete="name"
                required
                disabled={submitting}
              />
            </label>
            <label htmlFor="owner-invite-phone">
              Indian mobile number
              <input
                id="owner-invite-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setManualPhoneConfirmed(false);
                }}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                required
                disabled={submitting}
              />
            </label>
          </div>

          <label className="owner-manual-confirmation" htmlFor="owner-manual-confirmed">
            <input
              id="owner-manual-confirmed"
              type="checkbox"
              checked={manualPhoneConfirmed}
              onChange={(event) => setManualPhoneConfirmed(event.target.checked)}
              required
              disabled={submitting}
            />
            <span>
              <strong>I personally confirmed this phone number with the PG owner.</strong>
              <small>No OTP is used, so this manual check prevents credentials going to the wrong person.</small>
            </span>
          </label>

          <label htmlFor="owner-invite-operator-password">
            Confirm your operator password
            <input
              id="owner-invite-operator-password"
              type="password"
              value={operatorPassword}
              onChange={(event) => setOperatorPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              required
              disabled={submitting}
            />
            <small>This confirms it is really you before the one-time owner login is created.</small>
          </label>

          <button
            className="button button-primary button-full"
            type="submit"
            disabled={submitting || !selectedOrganizationId || !manualPhoneConfirmed || operatorPassword.length < 8}
          >
            {submitting ? <RefreshCcw className="spin" size={17} /> : <UserRoundCheck size={17} />}
            {submitting ? "Creating owner login…" : "Create temporary owner login"}
          </button>
        </form>
      )}

      {resettable.length > 0 && (
        <section className="owner-reset-section" aria-labelledby="owner-reset-title">
          <div className="owner-reset-heading">
            <span className="owner-reset-icon"><RefreshCcw aria-hidden="true" size={17} /></span>
            <div>
              <h3 id="owner-reset-title">Regenerate a temporary password</h3>
              <p>Use this only when the owner did not receive or has lost the current temporary password. The previous temporary password stops working immediately.</p>
            </div>
          </div>

          <form className="modal-form owner-reset-form" onSubmit={resetTemporaryPassword} aria-busy={resetting}>
            <label htmlFor="owner-reset-organization">
              Owner account
              <select
                id="owner-reset-organization"
                value={selectedResetOrganizationId}
                onChange={(event) => {
                  setResetOrganizationId(event.target.value);
                  setResetPhoneConfirmed(false);
                  setResetOperatorPassword("");
                  setError(null);
                }}
                disabled={resetting}
                required
              >
                {resettable.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name} · {organization.ownerInvitation?.displayName} · {organization.ownerInvitation?.maskedPhone}
                  </option>
                ))}
              </select>
            </label>

            <label className="owner-manual-confirmation" htmlFor="owner-reset-manual-confirmed">
              <input
                id="owner-reset-manual-confirmed"
                type="checkbox"
                checked={resetPhoneConfirmed}
                onChange={(event) => setResetPhoneConfirmed(event.target.checked)}
                required
                disabled={resetting}
              />
              <span>
                <strong>I re-confirmed this owner and phone number before resetting access.</strong>
                <small>The new temporary password will replace the current one and will be shown only once.</small>
              </span>
            </label>

            <label htmlFor="owner-reset-operator-password">
              Confirm your operator password
              <input
                id="owner-reset-operator-password"
                type="password"
                value={resetOperatorPassword}
                onChange={(event) => setResetOperatorPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                autoComplete="current-password"
                required
                disabled={resetting}
              />
              <small>Your password is checked securely and is not stored by PGFlow.</small>
            </label>

            <button
              className="button button-secondary button-full"
              type="submit"
              disabled={resetting || !selectedResetOrganizationId || !resetPhoneConfirmed || resetOperatorPassword.length < 8}
            >
              <RefreshCcw className={resetting ? "spin" : ""} size={17} />
              {resetting ? "Regenerating temporary password…" : "Regenerate temporary password"}
            </button>
          </form>
        </section>
      )}

      {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}

      {result && (
        <OwnerCredentialsResult
          key={`${result.invitationId}:${result.temporaryPasswordExpiresAt}`}
          account={result}
          onCopyError={setError}
        />
      )}
    </article>
  );
}

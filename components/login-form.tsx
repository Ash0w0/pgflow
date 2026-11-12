"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Phone, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  isStrongOwnerPassword,
  OWNER_PASSWORD_MAX_LENGTH,
  OWNER_PASSWORD_MIN_LENGTH,
} from "@/lib/passwords";

const GENERIC_SIGN_IN_ERROR = "Unable to sign in. Check your phone number and password and try again.";

type ManualOwnerCredential = {
  phone: string;
  temporaryPassword: string;
  activationRequestId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function LoginForm({ demoMode, manualOwnerLogin = false }: { demoMode: boolean; manualOwnerLogin?: boolean }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [manualCredential, setManualCredential] = useState<ManualOwnerCredential | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [activationComplete, setActivationComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) return;

    const controller = new AbortController();
    async function checkExistingSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const result = await response.json() as { actor?: { role?: string }; redirectTo?: string };
        const role = result.actor?.role;
        const safeDestinations = new Set(["/", "/tenant", "/operator", "/account/password"]);
        const roleDestination = role === "platform_operator" ? "/operator" : role === "tenant" ? "/tenant" : "/";
        const destination = result.redirectTo && safeDestinations.has(result.redirectTo)
          ? result.redirectTo
          : roleDestination;
        router.replace(destination);
        router.refresh();
      } catch {
        // An absent or expired session simply leaves the normal login form available.
      } finally {
        if (!controller.signal.aborted) setCheckingSession(false);
      }
    }

    void checkExistingSession();
    return () => controller.abort();
  }, [demoMode, router]);

  if (demoMode) {
    return (
      <div className="role-shortcuts">
        <span>Explore as</span>
        <div>
          <Link href="/">Owner</Link>
          <Link href="/tenant">Tenant</Link>
          <Link href="/operator">Operator</Link>
        </div>
      </div>
    );
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || checkingSession) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(result)) {
        setError(GENERIC_SIGN_IN_ERROR);
        return;
      }

      if (
        manualOwnerLogin
        && result.credentialVerified === true
        && result.requiresPasswordChange === true
        && result.nextStep === "create_private_password"
      ) {
        // The high-entropy temporary password remains only in this component's
        // memory. It is never put in a URL, cookie, browser storage, or Auth JWT.
        setManualCredential({
          phone,
          temporaryPassword: password,
          activationRequestId: crypto.randomUUID(),
        });
        setPhone("");
        setPassword("");
        return;
      }
      if (result.authenticated !== true) {
        setError(GENERIC_SIGN_IN_ERROR);
        return;
      }

      const safeDestinations = new Set(["/", "/tenant", "/operator", "/account/password"]);
      const redirectTo = typeof result.redirectTo === "string" && safeDestinations.has(result.redirectTo)
        ? result.redirectTo
        : "/";
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError(GENERIC_SIGN_IN_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOwnerActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !manualCredential) return;

    if (newPassword !== passwordConfirmation) {
      setError("The two passwords do not match.");
      return;
    }
    if (!isStrongOwnerPassword(newPassword)) {
      setError("Use 12–128 characters with uppercase, lowercase, a number, and a symbol.");
      return;
    }
    if (newPassword === manualCredential.temporaryPassword) {
      setError("Choose a new password that is different from the temporary password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: manualCredential.phone,
          temporaryPassword: manualCredential.temporaryPassword,
          newPassword,
          activationRequestId: manualCredential.activationRequestId,
        }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(result) || result.activated !== true) {
        const message = isRecord(result) && typeof result.error === "string"
          ? result.error
          : "Your owner account could not be completed. Please try again.";
        setError(message);
        return;
      }

      setManualCredential(null);
      setNewPassword("");
      setPasswordConfirmation("");
      setActivationComplete(true);
    } catch {
      setError("Your owner account could not be completed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (activationComplete) {
    return (
      <div className="password-change-success" role="status">
        <span className="workspace-setup-icon"><CheckCircle2 aria-hidden="true" size={24} /></span>
        <h3>Your private password is active</h3>
        <p>Your temporary password can no longer be used. This PG workspace is still being prepared, so no dashboard is opened yet.</p>
        <div className="password-security-note">
          <ShieldCheck aria-hidden="true" size={17} />
          <span>You can safely close this page. The platform operator will tell you when the workspace is ready.</span>
        </div>
      </div>
    );
  }

  if (manualCredential) {
    return (
      <form className="password-change-form" onSubmit={handleOwnerActivation} aria-busy={submitting}>
        <div className="password-step-heading">
          <span className="activation-key" aria-hidden="true"><KeyRound size={18} /></span>
          <div><strong>Temporary login confirmed</strong><small>Create the private password only you will know.</small></div>
        </div>
        <label htmlFor="new-owner-password">
          New password
          <div className="input-with-icon">
            <KeyRound aria-hidden="true" size={17} />
            <input
              id="new-owner-password"
              type={showNewPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={OWNER_PASSWORD_MIN_LENGTH}
              maxLength={OWNER_PASSWORD_MAX_LENGTH}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              disabled={submitting}
            />
            <button
              className="password-visibility-button"
              type="button"
              onClick={() => setShowNewPassword((visible) => !visible)}
              aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              aria-pressed={showNewPassword}
              disabled={submitting}
            >
              {showNewPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
            </button>
          </div>
        </label>
        <label htmlFor="confirm-owner-password">
          Confirm new password
          <div className="input-with-icon">
            <KeyRound aria-hidden="true" size={17} />
            <input
              id="confirm-owner-password"
              type={showPasswordConfirmation ? "text" : "password"}
              autoComplete="new-password"
              minLength={OWNER_PASSWORD_MIN_LENGTH}
              maxLength={OWNER_PASSWORD_MAX_LENGTH}
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              required
              disabled={submitting}
            />
            <button
              className="password-visibility-button"
              type="button"
              onClick={() => setShowPasswordConfirmation((visible) => !visible)}
              aria-label={showPasswordConfirmation ? "Hide confirmed password" : "Show confirmed password"}
              aria-pressed={showPasswordConfirmation}
              disabled={submitting}
            >
              {showPasswordConfirmation ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
            </button>
          </div>
        </label>
        <p className="password-requirements">12–128 characters · uppercase · lowercase · number · symbol</p>
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="button button-primary button-full" type="submit" disabled={submitting}>
          {submitting ? "Securing your account…" : "Create private password"}
        </button>
        <button
          className="text-button password-start-over"
          type="button"
          disabled={submitting}
          onClick={() => {
            setManualCredential(null);
            setNewPassword("");
            setPasswordConfirmation("");
            setShowNewPassword(false);
            setShowPasswordConfirmation(false);
            setError(null);
          }}
        >
          Start again with a different temporary login
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignIn} aria-busy={submitting || checkingSession}>
      <label htmlFor="login-phone">
        Phone number
        <div className="input-with-icon">
          <Phone aria-hidden="true" size={17} />
          <input
            id="login-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            disabled={submitting || checkingSession}
          />
        </div>
      </label>
      <label htmlFor="login-password">
        <span className="label-header">
          <span>{manualOwnerLogin ? "Temporary password" : "Password"}</span>
          <Link href="/recover" className="forgot-password-link">
            Forgot password?
          </Link>
        </span>
        <div className="input-with-icon">
          <LockKeyhole aria-hidden="true" size={17} />
          <input
            id="login-password"
            name="password"
            type={showLoginPassword ? "text" : "password"}
            autoComplete={manualOwnerLogin ? "off" : "current-password"}
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={submitting || checkingSession}
          />
          <button
            className="password-visibility-button"
            type="button"
            onClick={() => setShowLoginPassword((visible) => !visible)}
            aria-label={showLoginPassword ? "Hide password" : "Show password"}
            aria-pressed={showLoginPassword}
            disabled={submitting || checkingSession}
          >
            {showLoginPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
          </button>
        </div>
      </label>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="button button-primary button-full" type="submit" disabled={submitting || checkingSession}>
        {checkingSession ? "Checking session…" : submitting ? "Checking credentials…" : manualOwnerLogin ? "Continue securely" : "Sign in"}
        {!submitting && !checkingSession && <ArrowRight aria-hidden="true" size={17} />}
      </button>
    </form>
  );
}

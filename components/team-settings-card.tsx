"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AlertCircle, Copy, KeyRound, MessageCircle, UserPlus, UsersRound } from "lucide-react";
import { StatusPill } from "./status-pill";

type Manager = { id: string; name: string; phone: string; maskedPhone: string; state: string; createdAt: string };
type Credential = { name: string; phone: string; temporaryPassword: string };

function isManagerList(value: unknown): value is { managers: Manager[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { managers?: unknown }).managers));
}

function errorFrom(value: unknown, fallback: string) {
  return value && typeof value === "object" && typeof (value as { error?: unknown }).error === "string"
    ? (value as { error: string }).error
    : fallback;
}

export function TeamSettingsCard({ demoMode, pgName }: { demoMode: boolean; pgName: string }) {
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmFor, setConfirmFor] = useState<{ manager: Manager; action: "enable" | "reset_password" } | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");

  const load = useCallback(async () => {
    if (demoMode) return;
    try {
      const response = await fetch("/api/team", { credentials: "same-origin", cache: "no-store" });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isManagerList(result)) throw new Error(errorFrom(result, "The team could not be loaded."));
      setManagers(result.managers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The team could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function addManager(event: FormEvent) {
    event.preventDefault();
    if (busy || demoMode) return;
    setBusy("add");
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, currentPassword: password }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorFrom(result, "The manager could not be added."));
      const issued = (result as { credential: { phone: string; temporaryPassword: string } }).credential;
      setCredential({ name: name.trim(), phone: issued.phone, temporaryPassword: issued.temporaryPassword });
      setCopied(false);
      setName("");
      setPhone("");
      setPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The manager could not be added.");
    } finally {
      setBusy(null);
    }
  }

  async function changeManager(manager: Manager, action: "disable" | "enable" | "reset_password", currentPassword?: string) {
    if (busy || demoMode) return;
    setBusy(manager.id);
    setError(null);
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipId: manager.id, action, ...(currentPassword ? { currentPassword } : {}) }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorFrom(result, "The manager could not be updated."));
      if (action === "reset_password") {
        const issued = (result as { credential: { phone: string; temporaryPassword: string } }).credential;
        setCredential({ name: manager.name, phone: issued.phone, temporaryPassword: issued.temporaryPassword });
        setCopied(false);
      }
      setConfirmFor(null);
      setConfirmPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The manager could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  const loginUrl = typeof window === "undefined" ? "" : `${window.location.origin}/login`;
  const whatsappMessage = credential
    ? `Hi ${credential.name}, you've been added as a manager for ${pgName} on PGFlow.\n\nSign in: ${loginUrl}\nPhone: ${credential.phone}\nOne-time password: ${credential.temporaryPassword}\n\nYou'll be asked to choose your own password when you first sign in.`
    : "";

  return (
    <section className="panel settings-card" aria-labelledby="team-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow"><UsersRound size={14} /> Team</span>
          <h2 id="team-settings-title">Managers</h2>
          <p>Managers can record cash, share payment links, handle complaints and move-outs. Only you can approve UPI payments, change UPI, rooms and residents.</p>
        </div>
      </div>

      {credential && (
        <div className="team-credential" role="status">
          <KeyRound size={18} />
          <div>
            <strong>Share this one-time password with {credential.name} now. It won&apos;t be shown again.</strong>
            <code>{credential.temporaryPassword}</code>
            <div className="team-credential-actions">
              <button className="button button-secondary" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(credential.temporaryPassword); setCopied(true); } catch { setError("Copy failed. Select the password manually."); }
              }}><Copy size={15} /> {copied ? "Copied" : "Copy password"}</button>
              <a className="button button-primary" href={`https://wa.me/${credential.phone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappMessage)}`} target="_blank" rel="noreferrer">
                <MessageCircle size={15} /> Open WhatsApp draft
              </a>
              <button className="button button-quiet" type="button" onClick={() => setCredential(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={15} /><span>{error}</span></div>}

      {loading ? <p>Loading team…</p> : managers.length === 0 ? (
        <p className="team-empty">No managers yet.</p>
      ) : (
        <ul className="team-list">
          {managers.map((manager) => (
            <li key={manager.id}>
              <div><strong>{manager.name}</strong><small>{manager.maskedPhone}</small></div>
              <StatusPill tone={manager.state === "active" ? "success" : "neutral"}>{manager.state === "active" ? "Active" : "Disabled"}</StatusPill>
              <div className="team-actions">
                {manager.state === "active" ? (
                  <>
                    <button className="button button-quiet" type="button" disabled={busy !== null} onClick={() => setConfirmFor({ manager, action: "reset_password" })}>Reset password</button>
                    <button className="button button-quiet" type="button" disabled={busy !== null} onClick={() => void changeManager(manager, "disable")}>Disable</button>
                  </>
                ) : (
                  <button className="button button-quiet" type="button" disabled={busy !== null} onClick={() => setConfirmFor({ manager, action: "enable" })}>Enable</button>
                )}
              </div>
              {confirmFor?.manager.id === manager.id && (
                <form className="team-confirm" onSubmit={(event) => { event.preventDefault(); void changeManager(manager, confirmFor.action, confirmPassword); }}>
                  <label>Your password to {confirmFor.action === "enable" ? "enable" : "reset"} {manager.name}
                    <input type="password" required minLength={8} maxLength={128} autoComplete="current-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                  </label>
                  <button className="button button-primary" type="submit" disabled={busy !== null}>Confirm</button>
                  <button className="button button-quiet" type="button" onClick={() => { setConfirmFor(null); setConfirmPassword(""); }}>Cancel</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="modal-form team-add-form" onSubmit={addManager}>
        <h3><UserPlus size={16} /> Add a manager</h3>
        <label>Manager name<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={demoMode} /></label>
        <label>Manager&apos;s mobile number<input required inputMode="tel" maxLength={20} placeholder="98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={demoMode} /></label>
        <label>Your password<input type="password" required minLength={8} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={demoMode} /></label>
        <button className="button button-primary" type="submit" disabled={busy !== null || demoMode}>{busy === "add" ? "Adding…" : "Add manager"}</button>
      </form>
    </section>
  );
}

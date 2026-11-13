"use client";

import { Check, Copy, KeyRound, MessageCircle, Power, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useBrand } from "./brand-provider";
import type { ResidentRegisterRow } from "@/lib/resident-setup-types";

type Access = ResidentRegisterRow["appAccess"];
type Credential = { phone: string; temporaryPassword: string };

/** Lets the owner give a resident their app login, reset it, or turn it off. */
export function ResidentAppAccessDialog({ resident, onClose }: { resident: ResidentRegisterRow; onClose: () => void }) {
  const brand = useBrand();
  const [access, setAccess] = useState<Access>(resident.appAccess);
  const [credential, setCredential] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstName = resident.fullName.trim().split(/\s+/)[0];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function call(method: "POST" | "PATCH", action?: "disable" | "enable" | "reset_password") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/residents/${resident.id}/app-access`, {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: action ? JSON.stringify({ action }) : undefined,
      });
      const result = await response.json().catch(() => null) as { access?: Access; credential?: Credential; error?: string } | null;
      if (!response.ok || !result?.access) throw new Error(result?.error ?? "App access could not be changed. Try again.");
      setAccess(result.access);
      setCredential(result.credential ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "App access could not be changed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const loginUrl = typeof window === "undefined" ? "" : `${window.location.origin}/login`;
  const message = credential
    ? `Hi ${firstName}, here is your ${brand.name} resident app.\n\nOpen: ${loginUrl}\nPhone: ${credential.phone}\nOne-time password: ${credential.temporaryPassword}\n\nYou will choose your own password when you sign in. You can see your rent, pay, get receipts and report problems there.`
    : "";

  return (
    <div className="setup-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="setup-dialog app-access-dialog" role="dialog" aria-modal="true" aria-labelledby="app-access-title">
        <header>
          <div><span className="eyebrow">Resident app</span><h2 id="app-access-title">{resident.fullName}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>

        {credential ? (
          <>
            <div className="app-access-state active"><span><KeyRound size={19} /></span><div><strong>Share this with {firstName} now</strong>It is shown only once. {firstName} will choose a private password at first sign-in.</div></div>
            <code className="app-access-password">{credential.temporaryPassword}</code>
            <div className="app-access-actions">
              <a className="button button-primary" href={`https://wa.me/${credential.phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Send on WhatsApp</a>
              <button className="button button-secondary" type="button" onClick={async () => {
                try { await navigator.clipboard.writeText(credential.temporaryPassword); setCopied(true); } catch { setError("Copy failed. Select the password manually."); }
              }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy password"}</button>
            </div>
          </>
        ) : access === "none" ? (
          <>
            <div className="app-access-state"><span><Smartphone size={19} /></span><div><strong>No app login yet</strong>{firstName} can already pay from WhatsApp links. The app adds their bills, receipts and problem reports in one place.</div></div>
            <ol className="app-access-steps">
              <li>You create the login. It uses {firstName}&apos;s phone number on file.</li>
              <li>You send the one-time password on WhatsApp.</li>
              <li>{firstName} signs in and chooses a private password.</li>
            </ol>
            <div className="app-access-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => call("POST")}><Smartphone size={16} /> {busy ? "Creating…" : "Create app login"}</button></div>
          </>
        ) : (
          <>
            <div className={`app-access-state ${access}`}><span><Smartphone size={19} /></span><div><strong>{access === "active" ? "App login is on" : "App login is off"}</strong>{access === "active" ? `${firstName} can sign in and see only their own rent, receipts and reports.` : `${firstName} cannot sign in until you turn it back on.`}</div></div>
            <div className="app-access-actions">
              {access === "active" && <button className="button button-secondary" type="button" disabled={busy} onClick={() => call("PATCH", "reset_password")}><KeyRound size={16} /> Forgot password? Issue a new one</button>}
              <button className={`button ${access === "active" ? "button-danger-quiet" : "button-primary"}`} type="button" disabled={busy} onClick={() => call("PATCH", access === "active" ? "disable" : "enable")}><Power size={16} /> {access === "active" ? "Turn off" : "Turn on"}</button>
            </div>
          </>
        )}
        {error && <p className="setup-form-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { editorialSerif } from "@/components/home/fonts";
import { isAcceptableResidentPassword, RESIDENT_PASSWORD_MIN_LENGTH } from "@/lib/passwords";
import "./resident-app.css";

/** First sign-in and later password changes for residents. */
export function ResidentPassword({ firstLogin }: { firstLogin: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rules = [
    { ok: next.length >= RESIDENT_PASSWORD_MIN_LENGTH, label: `${RESIDENT_PASSWORD_MIN_LENGTH}+ characters` },
    { ok: /[A-Za-z]/.test(next), label: "A letter" },
    { ok: /\d/.test(next), label: "A number" },
    { ok: next.length > 0 && next !== current, label: "Not the old one" },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !isAcceptableResidentPassword(next) || next === current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next, passwordConfirmation: next }),
      });
      const payload = await response.json().catch(() => null) as { changed?: boolean; error?: string } | null;
      if (!response.ok || payload?.changed !== true) throw new Error(payload?.error ?? "Your password could not be changed.");
      setDone(true);
      window.setTimeout(() => { router.replace("/login"); router.refresh(); }, 1400);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be changed.");
      setBusy(false);
    }
  }

  return (
    <div className={`ra-shell ${editorialSerif.variable}`}>
      <main className="ra-auth">
        {!firstLogin && <Link className="ra-back" href="/tenant"><ArrowLeft size={15} />Back</Link>}
        <h1>{done ? "All set." : firstLogin ? "Welcome. Make it yours." : "New password"}</h1>
        <p>
          {done
            ? "Sign in once more with your new password."
            : firstLogin
              ? "Your PG gave you a one-time password. Enter it below, then choose a password only you know."
              : "Enter your current password, then choose a new one. You will sign in again afterwards."}
        </p>
        {!done && (
          <form onSubmit={submit}>
            <label>{firstLogin ? "One-time password from your PG" : "Current password"}
              <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
            </label>
            <label>Your new password
              <input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required />
            </label>
            <ul className="ra-rules">
              {rules.map((rule) => <li key={rule.label} className={rule.ok ? "ok" : undefined}><span><Check size={11} /></span>{rule.label}</li>)}
            </ul>
            {error && <p className="ra-error" role="alert">{error}</p>}
            <button className="ra-cta" type="submit" disabled={busy || !rules.every((rule) => rule.ok)}>{busy ? "Saving…" : "Save password"}</button>
          </form>
        )}
      </main>
    </div>
  );
}

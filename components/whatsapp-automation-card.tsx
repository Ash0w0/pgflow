"use client";

import { useState } from "react";
import { AlertCircle, BellRing, CheckCircle2 } from "lucide-react";

export type WhatsAppAutomationSettings = { autoReminders: boolean; autoReceipts: boolean; language: "en" | "hi" };

export function WhatsAppAutomationCard({ initial, demoMode }: { initial: WhatsAppAutomationSettings; demoMode: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [consent, setConsent] = useState(initial.autoReminders || initial.autoReceipts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const enabling = settings.autoReminders || settings.autoReceipts;

  async function save() {
    if (busy || demoMode) return;
    if (enabling && !consent) { setError("Confirm that your residents agreed to receive WhatsApp messages."); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      const response = await fetch("/api/settings/whatsapp", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The WhatsApp settings could not be saved.");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The WhatsApp settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="whatsapp-automation-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow"><BellRing size={14} /> Automatic messages</span>
          <h2 id="whatsapp-automation-title">Reminders &amp; receipts on WhatsApp</h2>
          <p>Residents get a secure link to pay by UPI, and their receipt the moment you approve a payment.</p>
        </div>
      </div>
      <div className="modal-form">
        <label className="automation-toggle">
          <input type="checkbox" checked={settings.autoReminders} disabled={demoMode} onChange={(event) => { setSettings({ ...settings, autoReminders: event.target.checked }); setSaved(false); }} />
          <span><strong>Rent reminders</strong>3 days before the due date, on the due date, and 3 days after if still unpaid. Each includes a fresh 7-day payment link.</span>
        </label>
        <label className="automation-toggle">
          <input type="checkbox" checked={settings.autoReceipts} disabled={demoMode} onChange={(event) => { setSettings({ ...settings, autoReceipts: event.target.checked }); setSaved(false); }} />
          <span><strong>Receipts</strong>Sent automatically when a UPI or cash payment is approved, with a link to the official receipt.</span>
        </label>
        <label>Message language
          <select value={settings.language} disabled={demoMode} onChange={(event) => { setSettings({ ...settings, language: event.target.value === "hi" ? "hi" : "en" }); setSaved(false); }}>
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
          </select>
        </label>
        {enabling && (
          <label className="automation-toggle">
            <input type="checkbox" checked={consent} disabled={demoMode} onChange={(event) => setConsent(event.target.checked)} />
            <span>My residents have agreed to receive rent and receipt messages on WhatsApp.</span>
          </label>
        )}
        {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>}
        {saved && <div className="setup-feedback success" role="status"><CheckCircle2 size={15} /><span>Saved. Automatic messages follow these settings from now on.</span></div>}
        <button className="button button-primary" type="button" disabled={busy || demoMode} onClick={() => void save()}>{busy ? "Saving…" : "Save WhatsApp settings"}</button>
      </div>
    </section>
  );
}

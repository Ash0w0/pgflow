"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, X } from "lucide-react";
import type { PlanSummary } from "@/lib/plan";

type Action = "mark_paid" | "extend_trial" | "end_access";

function isoDate(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(date);
}

export function planLabel(plan: PlanSummary) {
  if (plan.status === "expired") return "Expired · read-only";
  const kind = plan.status === "trial" ? "Trial" : "Paid";
  return `${kind} · ${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} left`;
}

export function PlanChangeDialog({
  organization,
  onClose,
  onChanged,
}: {
  organization: { id: string; name: string; plan: PlanSummary };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<Action>("mark_paid");
  const [until, setUntil] = useState(isoDate(30));
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: Action) {
    setAction(next);
    setUntil(isoDate(next === "extend_trial" ? 7 : 30));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations/plan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: organization.id,
          action,
          ...(action === "end_access" ? {} : { until }),
          note,
          operatorPassword: password,
        }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "The plan could not be changed.");
      setPassword("");
      onChanged();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The plan could not be changed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">{planLabel(organization.plan)}</span>
            <h2 id="plan-dialog-title">Change plan for {organization.name}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close plan dialog" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="modal-form" onSubmit={submit}>
        <fieldset className="plan-action-options">
          <legend>What happened?</legend>
          <label><input type="radio" name="plan-action" checked={action === "mark_paid"} onChange={() => choose("mark_paid")} /> Payment received: mark paid until a date</label>
          <label><input type="radio" name="plan-action" checked={action === "extend_trial"} onChange={() => choose("extend_trial")} /> Extend the free trial</label>
          <label><input type="radio" name="plan-action" checked={action === "end_access"} onChange={() => choose("end_access")} /> Didn&apos;t pay: make the workspace read-only now</label>
        </fieldset>

        {action !== "end_access" && (
          <label>
            {action === "mark_paid" ? "Paid until (inclusive)" : "Trial ends on (inclusive)"}
            <input type="date" required value={until} min={isoDate(0)} onChange={(event) => setUntil(event.target.value)} />
          </label>
        )}
        <label>
          Note <small>Optional, e.g. &ldquo;₹1,999 UPI on 12 Nov&rdquo;</small>
          <input maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <label>
          Your operator password
          <input type="password" required minLength={8} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>

        {error && <div className="live-operator-feedback feedback-error" role="alert"><AlertCircle size={14} /><span>{error}</span></div>}

        <button className="button button-primary button-full" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save plan"}</button>
        </form>
      </section>
    </div>
  );
}

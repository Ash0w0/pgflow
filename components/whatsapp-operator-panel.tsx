"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageSquare, RefreshCcw, RotateCcw } from "lucide-react";

type Overview = {
  connections: Array<{ id: string; label: string; state: string; graph_version: string }>;
  templates: Array<{ purpose: string; language_code: string; approval_state: string }>;
  unresolved: number;
  backlog: Array<{ id: string; state: string; attempts: number }>;
  deadLetters: Array<{ id: string; attempts: number; last_error_code: string | null }>;
  heartbeats: Array<{ worker: string; last_completed_at: string | null }>;
};

export function WhatsAppOperatorPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/operator/whatsapp/overview", { credentials: "same-origin" });
    const data = await response.json() as Overview & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "WhatsApp readiness could not be loaded.");
    setOverview(data);
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/operator/whatsapp/overview", { credentials: "same-origin" })
      .then(async (response) => {
        const data = await response.json() as Overview & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "WhatsApp readiness could not be loaded.");
        return data;
      })
      .then((data) => { if (active) setOverview(data); })
      .catch((caught: Error) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, []);

  async function syncTemplates() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/operator/whatsapp/templates/sync", { method: "POST", credentials: "same-origin" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Template sync failed.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Template sync failed."); }
    finally { setBusy(false); }
  }
  async function initializeConnection() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/operator/whatsapp/connection/initialize", { method: "POST", credentials: "same-origin" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Connection initialization failed.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Connection initialization failed."); }
    finally { setBusy(false); }
  }
  async function replay(jobId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/operator/whatsapp/dead-letters/replay", {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Replay was refused.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Replay was refused."); }
    finally { setBusy(false); }
  }
  const approved = overview?.templates.filter((template) => template.approval_state === "approved").length ?? 0;
  return (
    <section className="panel" aria-labelledby="whatsapp-operator-title">
      <div className="panel-head">
        <div><span className="eyebrow">Messaging operations</span><h2 id="whatsapp-operator-title">WhatsApp readiness</h2><p>Connection, approved templates, queue health, unresolved routing, and controlled replay.</p></div>
        <button className="button button-secondary" type="button" onClick={() => void load()} disabled={busy}><RefreshCcw size={16} />Refresh</button>
      </div>
      {error && <div className="setup-feedback error" role="alert"><AlertTriangle size={17} />{error}</div>}
      <div className="operator-metric-grid">
        <article><span><MessageSquare size={19} /></span><div><small>Connection</small><strong>{overview?.connections[0]?.state ?? "Missing"}</strong><p>{overview?.connections[0]?.graph_version ?? "No Graph version"}</p></div></article>
        <article><span><CheckCircle2 size={19} /></span><div><small>Approved templates</small><strong>{approved}</strong><p>Exact language/schema matches only</p></div></article>
        <article><span><RefreshCcw size={19} /></span><div><small>Queue backlog</small><strong>{overview?.backlog.length ?? "—"}</strong><p>{overview?.deadLetters.length ?? 0} dead letters</p></div></article>
        <article><span><AlertTriangle size={19} /></span><div><small>Needs routing</small><strong>{overview?.unresolved ?? "—"}</strong><p>No PG data disclosed while unresolved</p></div></article>
      </div>
      <div className="invoice-actions">
        <button className="button button-secondary" type="button" onClick={initializeConnection} disabled={busy}>Initialize registry</button>
        <button className="button button-primary" type="button" onClick={syncTemplates} disabled={busy}>Sync Meta templates</button>
        {overview?.deadLetters.slice(0, 3).map((job) => (
          <button className="button button-secondary" type="button" key={job.id} onClick={() => replay(job.id)} disabled={busy}>
            <RotateCcw size={15} />Replay safe failure
          </button>
        ))}
      </div>
    </section>
  );
}

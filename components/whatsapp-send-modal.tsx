"use client";

import { useState } from "react";
import { MessageSquare, Send, ShieldCheck } from "lucide-react";

export interface WhatsAppSendTarget {
  invoiceId: string;
  invoiceNumber: string;
  recipientName: string;
  stage?: "t-3" | "due" | "t+2";
}

export function WhatsAppSendModal({
  isOpen,
  target,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  target: WhatsAppSendTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  if (!isOpen || !target) return null;
  const activeTarget = target;

  async function enqueue() {
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      if (activeTarget.invoiceId.startsWith("demo-")) {
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        onSuccess();
        onClose();
        return;
      }
      const response = await fetch("/api/whatsapp/send", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "rent_reminder",
          invoiceId: activeTarget.invoiceId,
          stage: activeTarget.stage ?? "due",
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Reminder could not be queued.");
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Reminder could not be queued.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <MessageSquare className="text-emerald-600" size={22} />
          <div><h3 className="text-xl font-bold">Queue rent reminder</h3><p className="text-sm text-slate-500">{target.invoiceNumber} · {target.recipientName}</p></div>
        </header>
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <ShieldCheck className="mb-2" size={18} />
          PGFlow resolves the opted-in contact, preferred language, approved Meta template, current balance, and a new seven-day secure payment link on the server.
        </div>
        {errorMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{errorMessage}</p>}
        <footer className="mt-5 flex justify-end gap-3">
          <button className="button button-quiet" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button className="button button-primary" type="button" onClick={enqueue} disabled={isSubmitting}>
            <Send size={15} />{isSubmitting ? "Queueing…" : "Queue approved reminder"}
          </button>
        </footer>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { MessageSquare, Send, CheckCircle2, AlertCircle, PhoneCall } from "lucide-react";
import { WhatsAppSendModal, WhatsAppSendTarget } from "./whatsapp-send-modal";

export function WhatsAppSettingsCard() {
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<WhatsAppSendTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function openTestModal() {
    setTestTarget({
      type: "rent_due",
      recipientName: "Aarav Shah (Owner Test)",
      recipientPhone: "919876543210",
      amount: 8500,
      billingPeriod: "July 2026",
      pgName: "PGFlow Sample PG",
      dueDate: "05 July 2026",
      paymentUrl: "http://localhost:3000/pay/demo",
    });
    setTestModalOpen(true);
  }

  return (
    <section className="panel whatsapp-settings-card" aria-labelledby="whatsapp-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">WhatsApp Communications</span>
          <h2 id="whatsapp-settings-title">WhatsApp Cloud API</h2>
          <p>Send instant rent reminders, official payment receipts, and daily digests directly to residents on WhatsApp.</p>
        </div>
        <span className="owner-invite-icon">
          <MessageSquare size={20} />
        </span>
      </div>

      <div className="space-y-4 text-sm">
        {/* Status Indicator */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600" size={20} />
            <div>
              <strong className="block font-bold text-slate-900 dark:text-white">
                WhatsApp Messaging Active
              </strong>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                Outbound reminders & receipts enabled via Meta Graph API v18.0.
              </span>
            </div>
          </div>
          <span className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-white">
            Ready
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
            <span className="block text-xs font-semibold text-slate-400 uppercase">
              Supported Templates
            </span>
            <strong className="block text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              Rent Due, Payment Receipts, Daily Digest
            </strong>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
            <span className="block text-xs font-semibold text-slate-400 uppercase">
              Languages
            </span>
            <strong className="block text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              Bilingual (English & हिंदी)
            </strong>
          </div>
        </div>

        {/* Info Box */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-500/20 text-xs">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>
            WhatsApp messages are sent using Meta-approved templates. To customize outbound templates or Meta WABA credentials, configure <code>WHATSAPP_TOKEN</code> in your environment.
          </span>
        </div>

        {successMessage && (
          <div className="live-operator-feedback feedback-success" role="status">
            <CheckCircle2 size={17} />
            {successMessage}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={openTestModal}
            className="button button-primary flex items-center gap-2"
          >
            <Send size={15} />
            <span>Test WhatsApp Message Dispatch</span>
          </button>
        </div>
      </div>

      {testModalOpen && (
        <WhatsAppSendModal
          isOpen={testModalOpen}
          target={testTarget}
          onClose={() => setTestModalOpen(false)}
          onSuccess={() => setSuccessMessage("Test WhatsApp reminder dispatched successfully!")}
        />
      )}
    </section>
  );
}

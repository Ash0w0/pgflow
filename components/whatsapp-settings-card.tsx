"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, MessageSquare, Send } from "lucide-react";
import { WhatsAppSendModal, type WhatsAppSendTarget } from "./whatsapp-send-modal";

export function WhatsAppSettingsCard({
  configured,
  ownerPhone,
  demoMode,
}: {
  configured: boolean;
  ownerPhone: string | null;
  demoMode: boolean;
}) {
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<WhatsAppSendTarget | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // The test dispatch goes to the signed-in owner's own number — never a placeholder,
  // which would deliver a rent reminder to an unrelated person.
  const testPhone = ownerPhone?.replace(/^\+/, "") ?? "";
  const canSendTest = configured && (demoMode || testPhone.length > 0);

  function openTestModal() {
    setSuccessMessage(null);
    setTestTarget({
      type: "rent_due",
      recipientName: "Owner test message",
      recipientPhone: testPhone || "919999999999",
      amount: 8500,
      billingPeriod: "Test period",
      pgName: "Your PG",
      dueDate: "05 of this month",
      paymentUrl: typeof window === "undefined" ? "/pay/demo" : `${window.location.origin}/pay/demo`,
    });
    setTestModalOpen(true);
  }

  return (
    <section className="panel whatsapp-settings-card" aria-labelledby="whatsapp-settings-title">
      <div className="panel-head">
        <div>
          <span className="eyebrow">WhatsApp communications</span>
          <h2 id="whatsapp-settings-title">WhatsApp Cloud API</h2>
          <p>Send rent reminders, payment receipts, and daily digests to residents on WhatsApp.</p>
        </div>
        <span className="owner-invite-icon">
          <MessageSquare size={20} />
        </span>
      </div>

      <div className="space-y-4 text-sm">
        {configured ? (
          <div className="flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-emerald-600" size={20} />
              <div>
                <strong className="block font-bold text-slate-900 dark:text-white">
                  {demoMode ? "WhatsApp messaging simulated" : "WhatsApp messaging active"}
                </strong>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {demoMode
                    ? "Demo mode previews message templates without contacting Meta."
                    : "Outbound reminders and receipts are enabled."}
                </span>
              </div>
            </div>
            <span className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-white">
              {demoMode ? "Demo" : "Ready"}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-amber-600" size={20} />
              <div>
                <strong className="block font-bold text-slate-900 dark:text-white">
                  WhatsApp messaging not configured
                </strong>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Reminders and receipts are queued, and sending starts once PGFlow connects WhatsApp.
                </span>
              </div>
            </div>
            <span className="px-3 py-1 text-xs font-bold rounded-lg bg-amber-600 text-white">Inactive</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
            <span className="block text-xs font-semibold text-slate-400 uppercase">Supported templates</span>
            <strong className="block text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              Rent reminders and payment receipts
            </strong>
          </div>
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-800">
            <span className="block text-xs font-semibold text-slate-400 uppercase">Languages</span>
            <strong className="block text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
              English and हिंदी
            </strong>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-500/20 text-xs">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>
            Messages are sent from the PGFlow WhatsApp Business number using Meta-approved templates.
            {configured ? "" : " PGFlow is still connecting the number; nothing is sent until then, and queued messages wait safely."}
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
            disabled={!canSendTest}
            title={
              !configured
                ? "Configure WhatsApp credentials to send a test message"
                : !canSendTest
                  ? "Your account needs a verified phone number to receive the test"
                  : undefined
            }
            className="button button-primary flex items-center gap-2"
          >
            <Send size={15} />
            <span>Send test message to myself</span>
          </button>
        </div>
      </div>

      <WhatsAppSendModal
        isOpen={testModalOpen}
        target={testTarget}
        onClose={() => setTestModalOpen(false)}
        onSuccess={() => {
          setTestModalOpen(false);
          setSuccessMessage("Test WhatsApp message dispatched.");
        }}
      />
    </section>
  );
}

"use client";

import { useState } from "react";
import { MessageSquare, Send, Sparkles } from "lucide-react";
import {
  getRentDueReminderPreview,
  getPaymentReceiptPreview,
  getDailyOwnerDigestPreview,
} from "@/lib/whatsapp/templates";

export interface WhatsAppSendTarget {
  type: "rent_due" | "payment_receipt" | "daily_digest";
  recipientName: string;
  recipientPhone: string;
  amount?: number;
  billingPeriod?: string;
  pgName?: string;
  dueDate?: string;
  paymentUrl?: string;
  receiptNumber?: string;
  receiptUrl?: string;
}

interface WhatsAppSendModalProps {
  isOpen: boolean;
  target: WhatsAppSendTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function WhatsAppSendModal({
  isOpen,
  target,
  onClose,
  onSuccess,
}: WhatsAppSendModalProps) {
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !target) return null;

  let previewText = "";
  if (target.type === "rent_due") {
    previewText = getRentDueReminderPreview({
      recipientPhone: target.recipientPhone,
      residentName: target.recipientName,
      amount: target.amount || 8500,
      billingPeriod: target.billingPeriod || "July 2026",
      pgName: target.pgName || "Nivasa PG",
      dueDate: target.dueDate || "05 July 2026",
      paymentUrl: target.paymentUrl || `http://localhost:3001/pay/demo`,
      language,
    });
  } else if (target.type === "payment_receipt") {
    previewText = getPaymentReceiptPreview({
      recipientPhone: target.recipientPhone,
      residentName: target.recipientName,
      amount: target.amount || 8500,
      billingPeriod: target.billingPeriod || "July 2026",
      receiptNumber: target.receiptNumber || "REC-2026-07-0018",
      receiptUrl: target.receiptUrl || `http://localhost:3001/api/payments/demo-pay-01/receipt`,
      language,
    });
  } else if (target.type === "daily_digest") {
    previewText = getDailyOwnerDigestPreview({
      ownerPhone: target.recipientPhone,
      ownerName: target.recipientName,
      dateStr: new Date().toISOString().split("T")[0],
      todayCollections: 45000,
      collectionsCount: 4,
      pendingAmount: 24000,
      pendingCount: 3,
      occupiedBeds: 48,
      vacantBeds: 2,
      openTickets: 1,
    });
  }

  const handleSend = async () => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: target.type,
          recipientPhone: target.recipientPhone,
          language,
          payload: {
            residentName: target.recipientName,
            ownerName: target.recipientName,
            amount: target.amount,
            billingPeriod: target.billingPeriod,
            pgName: target.pgName,
            dueDate: target.dueDate,
            paymentUrl: target.paymentUrl,
            receiptNumber: target.receiptNumber,
            receiptUrl: target.receiptUrl,
          },
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to dispatch WhatsApp message.");
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <MessageSquare className="text-emerald-500" size={22} />
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Send WhatsApp Message
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900">
            {errorMessage}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Recipient
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {target.recipientName} ({target.recipientPhone})
              </span>
            </div>
            {target.type !== "daily_digest" && (
              <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  className={`px-2 py-0.5 text-xs font-bold rounded ${
                    language === "en"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("hi")}
                  className={`px-2 py-0.5 text-xs font-bold rounded ${
                    language === "hi"
                      ? "bg-emerald-500 text-white"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  हिंदी
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              WhatsApp Message Preview
            </label>
            <div className="rounded-2xl bg-emerald-950/10 dark:bg-emerald-950/30 p-4 border border-emerald-500/20 text-slate-800 dark:text-slate-100 font-sans text-sm leading-relaxed whitespace-pre-wrap">
              {previewText}
            </div>
          </div>

          <div className="rounded-xl bg-amber-500/10 p-3 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <Sparkles size={16} />
            <span>
              Delivered via WhatsApp with real-time read receipts.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500 disabled:opacity-50"
            >
              <Send size={15} />
              <span>{isSubmitting ? "Sending..." : "Send on WhatsApp"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

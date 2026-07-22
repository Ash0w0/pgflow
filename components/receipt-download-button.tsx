"use client";

import { FileText } from "lucide-react";

interface ReceiptDownloadButtonProps {
  paymentId: string;
  label?: string;
  className?: string;
}

export function ReceiptDownloadButton({
  paymentId,
  label = "Receipt",
  className,
}: ReceiptDownloadButtonProps) {
  const handleOpenReceipt = () => {
    window.open(`/api/payments/${paymentId}/receipt`, "_blank");
  };

  return (
    <button
      onClick={handleOpenReceipt}
      className={
        className ||
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 transition-colors"
      }
      title="View and print official branded receipt"
    >
      <FileText size={13} />
      <span>{label}</span>
    </button>
  );
}

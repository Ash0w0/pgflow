"use client";

import { useState } from "react";
import { calculateMoveOutSettlement } from "@/lib/resident-settlement";

export interface ResidentMoveOutTarget {
  id: string;
  fullName: string;
  roomNumber?: string;
  securityDeposit: number;
  monthlyRent: number;
  requestedExitDate?: string;
}

interface MoveOutModalProps {
  isOpen: boolean;
  resident: ResidentMoveOutTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function MoveOutModal({
  isOpen,
  resident,
  onClose,
  onSuccess,
}: MoveOutModalProps) {
  const todayIso = new Date().toISOString().split("T")[0];

  const [exitDate, setExitDate] = useState(resident?.requestedExitDate ?? todayIso);
  const [utilityDeductions, setUtilityDeductions] = useState("0");
  const [damageDeductions, setDamageDeductions] = useState("0");
  const [unpaidRentDeductions, setUnpaidRentDeductions] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !resident) return null;

  const parsedUtility = parseFloat(utilityDeductions) || 0;
  const parsedDamage = parseFloat(damageDeductions) || 0;
  const parsedUnpaidRent = parseFloat(unpaidRentDeductions) || 0;

  const settlement = calculateMoveOutSettlement({
    depositAmount: resident.securityDeposit,
    utilityDeductions: parsedUtility,
    damageDeductions: parsedDamage,
    unpaidRentDeductions: parsedUnpaidRent,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/residents/${resident.id}/move-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exitDate,
          utilityDeductions: settlement.utilityDeductions,
          damageDeductions: settlement.damageDeductions,
          unpaidRentDeductions: settlement.unpaidRentDeductions,
          remarks,
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to process move-out settlement.");
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
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              Move-Out Settlement
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {resident.fullName} {resident.roomNumber ? `• Room ${resident.roomNumber}` : ""}
            </p>
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Exit Date
              </label>
              <input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Security Deposit Held
              </label>
              <div className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                ₹{resident.securityDeposit.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Deductions from Deposit (₹)
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400">
                  Utilities / Electricity
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={utilityDeductions}
                  onChange={(e) => setUtilityDeductions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400">
                  Damage Charges
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={damageDeductions}
                  onChange={(e) => setDamageDeductions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 dark:text-slate-400">
                  Unpaid Rent
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unpaidRentDeductions}
                  onChange={(e) => setUnpaidRentDeductions(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-amber-500/10 p-4 border border-amber-500/20 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Net Refund to Resident
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Deposit minus total deductions (₹{settlement.totalDeductions.toLocaleString("en-IN")})
              </span>
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              ₹{settlement.netRefundAmount.toLocaleString("en-IN")}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Remarks
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Room key handed back, electricity meter cleared."
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
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
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-600/30 hover:bg-amber-500 disabled:opacity-50"
            >
              {isSubmitting ? "Processing..." : "Complete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

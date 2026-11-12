export type PlanStatus = "trial" | "paid" | "expired";

export type PlanSummary = {
  status: PlanStatus;
  /** When the current trial or paid period ends; null when expired. */
  endsAt: string | null;
  /** Whole days left (rounded up), 0 when expired. */
  daysLeft: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Mirrors public.organization_plan_status() in the database. */
export function summarizePlan(
  trialEndsAt: string | null | undefined,
  paidUntil: string | null | undefined,
  now: number = Date.now(),
): PlanSummary {
  const paid = parse(paidUntil);
  if (paid !== null && paid > now) {
    return { status: "paid", endsAt: new Date(paid).toISOString(), daysLeft: Math.ceil((paid - now) / DAY_MS) };
  }
  const trial = parse(trialEndsAt);
  if (trial !== null && trial > now) {
    return { status: "trial", endsAt: new Date(trial).toISOString(), daysLeft: Math.ceil((trial - now) / DAY_MS) };
  }
  return { status: "expired", endsAt: null, daysLeft: 0 };
}

export const PLAN_READ_ONLY_MESSAGE =
  "Your PGFlow free trial has ended, so this workspace is read-only. Contact PGFlow on WhatsApp to continue.";

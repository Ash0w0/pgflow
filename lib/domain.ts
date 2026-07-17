const UTR_PATTERN = /^[A-Z0-9-]{8,30}$/;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function normalizeUtr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidUtr(value: string) {
  return UTR_PATTERN.test(normalizeUtr(value));
}

export function isValidPropertySlug(value: string) {
  return SLUG_PATTERN.test(value.trim().toLowerCase());
}

export function calculateElectricity(previousReading: number, currentReading: number, rate: number) {
  if (![previousReading, currentReading, rate].every(Number.isFinite)) throw new Error("Readings and rate must be finite numbers.");
  if (previousReading < 0 || currentReading < 0 || rate < 0) throw new Error("Readings and rate cannot be negative.");
  if (currentReading < previousReading) throw new Error("Current reading cannot be below the previous reading.");
  const units = currentReading - previousReading;
  return { units, amount: Math.round(units * rate * 100) / 100 };
}

export function allocateByOccupantDays(totalAmount: number, occupantDays: Record<string, number>) {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new Error("Amount must be a non-negative number.");
  const entries = Object.entries(occupantDays);
  if (entries.some(([, days]) => !Number.isFinite(days) || days < 0)) throw new Error("Occupant days cannot be negative.");
  const totalDays = entries.reduce((sum, [, days]) => sum + days, 0);
  if (totalDays === 0) return Object.fromEntries(entries.map(([id]) => [id, 0]));

  const totalPaise = Math.round(totalAmount * 100);
  const shares = entries.map(([id, days], index) => {
    const exact = (totalPaise * days) / totalDays;
    const paise = Math.floor(exact);
    return { id, index, paise, remainder: exact - paise };
  });
  let remainder = totalPaise - shares.reduce((sum, share) => sum + share.paise, 0);
  for (const share of [...shares].sort((left, right) => right.remainder - left.remainder || left.index - right.index)) {
    if (remainder <= 0) break;
    share.paise += 1;
    remainder -= 1;
  }
  return Object.fromEntries(shares.map(({ id, paise }) => [id, paise / 100]));
}

export function calculateDepositSettlement({
  refundableDeposit,
  unpaidRent,
  finalElectricity,
  approvedDeductions,
}: {
  refundableDeposit: number;
  unpaidRent: number;
  finalElectricity: number;
  approvedDeductions: number;
}) {
  const values = [refundableDeposit, unpaidRent, finalElectricity, approvedDeductions];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Settlement values must be non-negative numbers.");
  return Math.max(0, refundableDeposit - unpaidRent - finalElectricity - approvedDeductions);
}

export function createUpiUri({
  upiId,
  payeeName,
  amount,
  reference,
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  reference: string;
}) {
  if (!UPI_ID_PATTERN.test(upiId.trim())) throw new Error("A valid UPI ID is required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
  if (!payeeName.trim() || !reference.trim()) throw new Error("Payee name and payment reference are required.");
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: payeeName.trim(),
    am: amount.toFixed(2),
    cu: "INR",
    tn: reference.trim(),
    tr: reference.trim(),
  });
  return `upi://pay?${params.toString()}`;
}

export function nextProvisioningState(current: string) {
  const sequence = ["draft", "awaiting_data", "validating", "ready_to_provision", "provisioning", "core_ready", "integrations_pending", "live"];
  const index = sequence.indexOf(current);
  return index >= 0 && index < sequence.length - 1 ? sequence[index + 1] : current;
}

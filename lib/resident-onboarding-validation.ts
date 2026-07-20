export type ResidentOnboardingField =
  | "fullName"
  | "phone"
  | "alternatePhone"
  | "emergencyName"
  | "emergencyPhone"
  | "address"
  | "bedId"
  | "moveInDate"
  | "monthlyRent"
  | "depositPromised"
  | "openingDue"
  | "confirmAssignment";

export type ResidentOnboardingFieldErrors = Partial<Record<ResidentOnboardingField, string>>;

export type ResidentEditField = Exclude<
  ResidentOnboardingField,
  "bedId" | "openingDue" | "confirmAssignment"
>;

export type ResidentEditFieldErrors = Partial<Record<ResidentEditField, string>>;

type ResidentOnboardingValidationInput = Record<ResidentOnboardingField, unknown>;

const INDIAN_PHONE = /^\+91[6-9]\d{9}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_MESSAGE = "Enter a 10-digit Indian mobile number starting with 6, 7, 8, or 9.";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: unknown) {
  const raw = text(value);
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return raw;
}

function validDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return false;
  const latest = new Date();
  latest.setUTCDate(latest.getUTCDate() + 365);
  return value >= "2000-01-01" && value <= latest.toISOString().slice(0, 10);
}

function validMoney(value: unknown) {
  if (value === "" || value === null || value === undefined) return false;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isInteger(amount) && amount >= 0 && amount <= 10_000_000;
}

export function validateResidentOnboardingInput(input: ResidentOnboardingValidationInput) {
  const errors: ResidentOnboardingFieldErrors = {};
  const fullName = text(input.fullName);
  const phone = normalizePhone(input.phone);
  const alternatePhone = normalizePhone(input.alternatePhone);
  const emergencyName = text(input.emergencyName);
  const emergencyPhone = normalizePhone(input.emergencyPhone);
  const address = text(input.address);
  const moveInDate = text(input.moveInDate);

  if (fullName.length < 2 || fullName.length > 120) errors.fullName = "Enter a resident name between 2 and 120 characters.";
  if (!INDIAN_PHONE.test(phone)) errors.phone = PHONE_MESSAGE;
  if (text(input.alternatePhone) && !INDIAN_PHONE.test(alternatePhone)) errors.alternatePhone = PHONE_MESSAGE;
  else if (alternatePhone && alternatePhone === phone) errors.alternatePhone = "Alternate phone must be different from the resident phone.";
  if (emergencyName.length < 2 || emergencyName.length > 120) errors.emergencyName = "Enter an emergency contact name between 2 and 120 characters.";
  if (!INDIAN_PHONE.test(emergencyPhone)) errors.emergencyPhone = PHONE_MESSAGE;
  if (address.length > 500) errors.address = "Address must not exceed 500 characters.";
  if (!UUID.test(text(input.bedId))) errors.bedId = "Select an available vacant bed.";
  if (!validDate(moveInDate)) errors.moveInDate = "Choose a valid move-in date between 1 Jan 2000 and one year from today.";
  if (!validMoney(input.monthlyRent)) errors.monthlyRent = "Enter a whole-rupee rent between ₹0 and ₹1 crore.";
  if (!validMoney(input.depositPromised)) errors.depositPromised = "Enter a whole-rupee deposit between ₹0 and ₹1 crore.";
  if (!validMoney(input.openingDue)) errors.openingDue = "Enter a whole-rupee opening due between ₹0 and ₹1 crore.";
  if (input.confirmAssignment !== true) errors.confirmAssignment = "Confirm that you verified the resident, bed and opening amounts.";

  return errors;
}

export function validateResidentEditInput(input: Record<ResidentEditField, unknown>) {
  const errors = validateResidentOnboardingInput({
    ...input,
    bedId: "00000000-0000-4000-8000-000000000000",
    openingDue: 0,
    confirmAssignment: true,
  });
  delete errors.bedId;
  delete errors.openingDue;
  delete errors.confirmAssignment;
  return errors as ResidentEditFieldErrors;
}

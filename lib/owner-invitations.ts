const INDIA_PHONE = /^\+91[6-9]\d{9}$/;
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const OWNER_INVITATION_TTL_MS = 30 * 60 * 1000;
export const OWNER_TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return value.trim();
}

export function isValidIndianPhone(value: string) {
  return INDIA_PHONE.test(value);
}

/**
 * Compares the two exact phone formats used by PGFlow and Supabase Auth.
 * PGFlow stores +91..., while Supabase may return the same verified phone as
 * 91.... Deliberately reject spaces, punctuation, and all other formats here.
 */
export function isSameIndianPhone(left: string | null | undefined, right: string | null | undefined) {
  const canonicalize = (value: string | null | undefined) => {
    if (!value) return null;
    const canonical = value.startsWith("+") ? value : `+${value}`;
    return INDIA_PHONE.test(canonical) ? canonical : null;
  };

  const canonicalLeft = canonicalize(left);
  const canonicalRight = canonicalize(right);
  return canonicalLeft !== null && canonicalLeft === canonicalRight;
}

export function isValidInvitationToken(value: string) {
  return INVITATION_TOKEN.test(value);
}

export function isUuid(value: string) {
  return UUID.test(value);
}

export function maskIndianPhone(phone: string) {
  return INDIA_PHONE.test(phone) ? `${phone.slice(0, 3)} •••••• ${phone.slice(-4)}` : "Phone unavailable";
}

export function createInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

function randomIndex(length: number) {
  const upperBound = Math.floor(256 / length) * length;
  const byte = new Uint8Array(1);
  do {
    crypto.getRandomValues(byte);
  } while (byte[0] >= upperBound);
  return byte[0] % length;
}

/** Generates a strong password that is returned once and never persisted by the app. */
export function createTemporaryPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghjkmnpqrstuvwxyz",
    "23456789",
    "!@#$%&*+-_?",
  ];
  const all = groups.join("");
  const characters = groups.map((group) => group[randomIndex(group.length)]);

  while (characters.length < 20) characters.push(all[randomIndex(all.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

import { secureEqual } from "../secure-compare.ts";

/**
 * Verifies Meta's `X-Hub-Signature-256` header (HMAC-SHA256 of the raw request
 * body keyed with the app secret). Fails closed when the secret is missing.
 */
export async function verifyMetaSignature(rawBody: string, signature: string | null, appSecret: string | null) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = `sha256=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return secureEqual(signature.trim().toLowerCase(), expected);
}

export function whatsAppAppSecret() {
  const value = process.env.WHATSAPP_APP_SECRET?.trim() ?? "";
  return value && value !== "replace_me" ? value : null;
}

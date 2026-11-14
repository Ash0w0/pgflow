/**
 * Trusted database functions raise short business messages meant for staff
 * ("This workspace is read-only", "Bed is no longer available"). Anything that
 * looks like Postgres internals is replaced so schema details never reach a browser.
 */
const INTERNAL = /violates|constraint|relation "|column "|syntax error|permission denied|does not exist|invalid input|duplicate key|null value|schema cache|PGRST|\bSQL\b/i;

export function safeDbMessage(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message?.trim() ?? "";
  if (!message || message.length > 240 || INTERNAL.test(message)) return fallback;
  return message;
}

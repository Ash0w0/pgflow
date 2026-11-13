type Level = "info" | "warn" | "error";

/**
 * One-line JSON logs that Vercel (or any log drain) can filter and alert on.
 * Never pass secrets, phone numbers, or payment references as fields.
 */
export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const error = fields.error;
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
    ...(error instanceof Error ? { error: error.message } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

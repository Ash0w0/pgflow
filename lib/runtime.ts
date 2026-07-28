/**
 * Demo mode is opt-in and explicit. Never infer it from missing configuration:
 * `getSupabaseAdmin()` and `requirePublicSupabaseConfig()` already fail loudly when
 * production credentials are absent, and degrading to demo instead would serve
 * sample data from a production host with the page authorization gate disabled.
 */
export type PgflowRuntime = "production" | "demo";
export type PgflowEnvironment = "local" | "staging" | "production";
export type WhatsAppSendMode = "disabled" | "allowlist" | "live";

function enumValue<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = process.env[name]?.trim() || fallback;
  if (!allowed.includes(value as T)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function getPgflowRuntime(): PgflowRuntime {
  return enumValue("PGFLOW_RUNTIME", ["production", "demo"], "production");
}

export function getPgflowEnvironment(): PgflowEnvironment {
  return enumValue(
    "PGFLOW_ENV",
    ["local", "staging", "production"],
    process.env.NODE_ENV === "production" ? "production" : "local",
  );
}

export function getWhatsAppSendMode(): WhatsAppSendMode {
  return enumValue(
    "WHATSAPP_SEND_MODE",
    ["disabled", "allowlist", "live"],
    "disabled",
  );
}

export function isDemoRuntime() {
  return process.env.PGFLOW_RUNTIME === "demo";
}

export function isProductionRuntime() {
  return !isDemoRuntime();
}

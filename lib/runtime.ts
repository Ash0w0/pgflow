/**
 * Demo mode is opt-in and explicit. Never infer it from missing configuration:
 * `getSupabaseAdmin()` and `requirePublicSupabaseConfig()` already fail loudly when
 * production credentials are absent, and degrading to demo instead would serve
 * sample data from a production host with the page authorization gate disabled.
 */
export function isDemoRuntime() {
  return process.env.PGFLOW_RUNTIME === "demo";
}

export function isProductionRuntime() {
  return !isDemoRuntime();
}

export function isDemoRuntime() {
  return process.env.PGFLOW_RUNTIME === "demo";
}

export function isProductionRuntime() {
  return !isDemoRuntime();
}

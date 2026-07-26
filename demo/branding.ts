import type { PublicBrand } from "../lib/branding.ts";
import { normalizeHostname } from "../lib/branding.ts";

const DEMO_BRAND: PublicBrand = {
  organizationId: "org_sample_pgflow",
  name: "PGFlow Sample",
  shortName: "PGFlow",
  primary: "#123d32",
  accent: "#d7ff86",
  startUrl: "/tenant",
  demoMode: true,
};

export function resolveDemoBrand(hostHeader: string | null) {
  const hostname = normalizeHostname(hostHeader);
  return hostname === "demo.pgflow.co"
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
    ? DEMO_BRAND
    : null;
}

export function isDemoHostname(hostHeader: string | null) {
  return resolveDemoBrand(hostHeader) !== null;
}

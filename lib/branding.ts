export type PublicBrand = {
  organizationId: string;
  name: string;
  shortName: string;
  primary: string;
  accent: string;
  startUrl: string;
  demoMode: boolean;
};

const approvedDemoHosts: Record<string, PublicBrand> = {
  localhost: { organizationId: "org_sample_pgflow", name: "PGFlow Sample", shortName: "PGFlow", primary: "#123d32", accent: "#d7ff86", startUrl: "/tenant", demoMode: true },
  "demo.pgflow.app": { organizationId: "org_sample_pgflow", name: "PGFlow Sample", shortName: "PGFlow", primary: "#123d32", accent: "#d7ff86", startUrl: "/tenant", demoMode: true },
  "demo.pgflow.co": { organizationId: "org_sample_pgflow", name: "PGFlow Sample", shortName: "PGFlow", primary: "#123d32", accent: "#d7ff86", startUrl: "/tenant", demoMode: true },
  "iris.pgflow.app": { organizationId: "org_synth_20", name: "Iris Residence Preview", shortName: "Iris", primary: "#5b43d6", accent: "#efeaff", startUrl: "/tenant", demoMode: true },
  "metronest.pgflow.app": { organizationId: "org_synth_200", name: "MetroNest Preview", shortName: "MetroNest", primary: "#165e91", accent: "#d8efff", startUrl: "/tenant", demoMode: true },
};

export const DEFAULT_BRAND_PRIMARY = "#123d32";
export const DEFAULT_BRAND_ACCENT = "#d7ff86";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Brand colors are interpolated into CSS custom properties, so only full six-digit hex is accepted. */
export function isBrandColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value.trim());
}

export function safeColor(value: string, fallback: string) {
  return HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

export function normalizeHostname(value: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function resolveApprovedBrand(hostHeader: string | null) {
  const hostname = normalizeHostname(hostHeader);
  return approvedDemoHosts[hostname] ?? null;
}

export function isApprovedHostname(hostHeader: string | null) {
  return normalizeHostname(hostHeader) in approvedDemoHosts;
}

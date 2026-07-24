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
  "iris.pgflow.app": { organizationId: "org_synth_20", name: "Iris Residence Preview", shortName: "Iris", primary: "#5b43d6", accent: "#efeaff", startUrl: "/tenant", demoMode: true },
  "metronest.pgflow.app": { organizationId: "org_synth_200", name: "MetroNest Preview", shortName: "MetroNest", primary: "#165e91", accent: "#d8efff", startUrl: "/tenant", demoMode: true },
};

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

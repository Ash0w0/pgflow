import { normalizeHostname } from "./branding.ts";

const workspaceSlugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const reservedWorkspaceSlugs = new Set(["admin", "www"]);

export function isPlatformLoginHostname(hostname: string, platformDomain: string) {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(platformDomain);

  return Boolean(
    normalizedDomain
      && (normalizedHostname === normalizedDomain || normalizedHostname === `www.${normalizedDomain}`),
  );
}

export function workspaceHostnameForSlug(value: string, platformDomain: string) {
  const slug = value.trim().toLowerCase();
  const normalizedDomain = normalizeHostname(platformDomain);

  if (
    !normalizedDomain
    || !workspaceSlugPattern.test(slug)
    || reservedWorkspaceSlugs.has(slug)
  ) {
    return null;
  }

  return `${slug}.${normalizedDomain}`;
}

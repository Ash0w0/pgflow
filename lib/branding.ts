export type PublicBrand = {
  organizationId: string;
  name: string;
  shortName: string;
  primary: string;
  accent: string;
  startUrl: string;
  demoMode: boolean;
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

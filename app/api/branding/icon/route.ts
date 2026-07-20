import { resolvePublicBrandContext } from "@/lib/tenancy";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_PRIMARY = "#123d32";
const DEFAULT_ACCENT = "#d7ff86";

const SVG_HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; script-src 'none'; style-src 'none'; sandbox",
};

function validatedColor(value: string, fallback: string) {
  return HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function brandInitial(shortName: string, name: string) {
  const character = `${shortName} ${name}`.match(/[\p{L}\p{N}]/u)?.[0] ?? "P";
  return [...character.toLocaleUpperCase("en-IN")][0] ?? "P";
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;",
  })[character] ?? "");
}

export async function GET(request: Request) {
  const brand = await resolvePublicBrandContext(request);
  if (!brand) {
    return Response.json(
      { error: "Unknown property hostname." },
      { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
    );
  }

  const primary = validatedColor(brand.primary, DEFAULT_PRIMARY);
  const accent = validatedColor(brand.accent, DEFAULT_ACCENT);
  const initial = escapeXml(brandInitial(brand.shortName, brand.name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title description">
  <title id="title">PG brand monogram</title>
  <desc id="description">A branded property application icon</desc>
  <rect width="512" height="512" rx="112" fill="${primary}"/>
  <circle cx="256" cy="256" r="154" fill="${accent}"/>
  <text x="256" y="278" text-anchor="middle" dominant-baseline="middle" fill="${primary}" font-family="Arial, sans-serif" font-size="220" font-weight="700">${initial}</text>
</svg>`;

  return new Response(svg, { headers: SVG_HEADERS });
}

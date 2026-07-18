import { isDemoRuntime } from "@/lib/runtime";
import { resolvePublicBrandContext } from "@/lib/tenancy";

const MANIFEST_HEADERS = {
  "content-type": "application/manifest+json",
  "cache-control": "no-store",
};

export async function GET(request: Request) {
  const brand = await resolvePublicBrandContext(request);
  if (!brand) {
    return Response.json(
      { error: "Unknown property hostname." },
      { status: 404, headers: MANIFEST_HEADERS },
    );
  }

  const description = isDemoRuntime()
    ? `A fictional demonstration of branded PG operations for ${brand.name}. Live financial actions are disabled.`
    : `Branded PG operations for ${brand.name}, its residents, and property staff.`;

  return Response.json({
    name: brand.name,
    short_name: brand.shortName,
    description,
    id: brand.startUrl,
    start_url: brand.startUrl,
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: brand.primary,
    lang: "en-IN",
    categories: ["business", "finance", "utilities"],
    icons: [
      { src: "/api/branding/icon", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
  }, { headers: MANIFEST_HEADERS });
}

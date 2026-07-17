import { resolveApprovedBrand } from "@/lib/branding";

export function GET(request: Request) {
  const brand = resolveApprovedBrand(request.headers.get("host"));
  return Response.json({
    name: brand.name,
    short_name: brand.shortName,
    description: "A fictional white-label PG operations demonstration. Live financial actions are disabled.",
    start_url: brand.startUrl,
    display: "standalone",
    background_color: "#f4f7f2",
    theme_color: brand.primary,
    lang: "en-IN",
    categories: ["business", "finance", "utilities"],
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  }, { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300, must-revalidate" } });
}

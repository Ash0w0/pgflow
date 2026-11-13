import { cache, type CSSProperties } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { BrandProvider, type BrandValue } from "@/components/brand-provider";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import { normalizeHostname, safeColor } from "@/lib/branding";
import { isDemoRuntime } from "@/lib/runtime";
import { hostnameFromHeaders, resolvePublicBrandContextForHostname } from "@/lib/tenancy";
import "./globals.css";

export const preferredRegion = "hnd1";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const PLATFORM_BRAND: BrandValue = {
  name: "PGFlow",
  shortName: "PGFlow",
  primary: "#123d32",
  accent: "#d7ff86",
  mode: "platform",
  platformName: "PGFlow",
};

function safeHostname(value: string | null) {
  const rawValue = value?.trim() ?? "";
  if (!rawValue || rawValue.includes(",")) return "";

  const hostname = normalizeHostname(rawValue);
  if (!hostname || hostname.length > 253) return "";

  const labels = hostname.split(".");
  if (labels.some((label) => (
    label.length < 1
    || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
  ))) {
    return "";
  }

  return hostname;
}

function safeBrandText(value: string, fallback: string, maximumLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maximumLength) : fallback;
}

function safeBrandInitial(value: string) {
  const initial = Array.from(value.trim())[0]?.toUpperCase() ?? "P";
  return /^[A-Z0-9]$/.test(initial) ? initial : "P";
}

const resolveLayoutBrand = cache(async (): Promise<BrandValue> => {
  if (isDemoRuntime()) return PLATFORM_BRAND;

  try {
    const requestHeaders = await headers();
    const hostname = hostnameFromHeaders(requestHeaders);
    const operatorHostname = safeHostname(process.env.OPERATOR_HOSTNAME ?? null);

    if (!hostname || (operatorHostname && hostname === operatorHostname)) return PLATFORM_BRAND;

    const tenant = await resolvePublicBrandContextForHostname(hostname);
    if (!tenant) return PLATFORM_BRAND;

    return {
      name: safeBrandText(tenant.name, PLATFORM_BRAND.name, 120),
      shortName: safeBrandText(tenant.shortName, PLATFORM_BRAND.shortName, 32),
      primary: safeColor(tenant.primary, PLATFORM_BRAND.primary),
      accent: safeColor(tenant.accent, PLATFORM_BRAND.accent),
      mode: tenant.demoMode ? "demo" : "tenant",
      platformName: "PGFlow",
      plan: tenant.demoMode ? undefined : tenant.plan,
    };
  } catch {
    return PLATFORM_BRAND;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveLayoutBrand();
  const description = brand.name + " workspace for rent, occupancy, and everyday PG operations.";
  const iconUrl = brand.mode === "platform" ? "/favicon.svg" : "/api/branding/icon";

  return {
    metadataBase: new URL("https://pgflow.co"),
    title: { default: brand.name, template: "%s · " + brand.shortName },
    description,
    applicationName: brand.name,
    manifest: "/manifest.webmanifest",
    // PG workspaces are private tools; only the platform marketing site is indexable.
    robots: brand.mode === "platform" ? undefined : { index: false, follow: false },
    icons: { icon: iconUrl, shortcut: iconUrl },
    openGraph: {
      title: brand.name,
      description,
      siteName: brand.name,
      type: "website",
      images: [{ url: "/og.png", width: 1680, height: 945, alt: brand.name + " PG operations" }],
    },
    twitter: { card: "summary_large_image", title: brand.name, description, images: ["/og.png"] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brand = await resolveLayoutBrand();
  return {
    themeColor: brand.primary,
    colorScheme: "light",
    width: "device-width",
    initialScale: 1,
  };
}

type BrandStyle = CSSProperties & {
  "--brand": string;
  "--accent": string;
  "--brand-initial": string;
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const brand = await resolveLayoutBrand();
  const brandStyle: BrandStyle = {
    "--brand": brand.primary,
    "--accent": brand.accent,
    "--brand-initial": JSON.stringify(safeBrandInitial(brand.shortName)),
  };

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={[geistSans.variable, geistMono.variable].join(" ")}
      style={brandStyle}
    >
      <body className="antialiased">
        <BrandProvider brand={brand}>{children}</BrandProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}

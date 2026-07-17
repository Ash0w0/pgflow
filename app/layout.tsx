import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://demo.pgflow.app"),
  title: { default: "PGFlow · White-label PG operations", template: "%s · PGFlow" },
  description: "A reusable, WhatsApp-first PG management template for rent, occupancy and everyday operations.",
  applicationName: "Nivasa Demo House",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "PGFlow · Rent on time. Operations in flow.",
    description: "A reusable, WhatsApp-first PG management template, provisioned in hours.",
    type: "website",
    images: [{ url: "/og.png", width: 1680, height: 945, alt: "PGFlow WhatsApp-first PG management" }],
  },
  twitter: { card: "summary_large_image", title: "PGFlow · White-label PG operations", images: ["/og.png"] },
};

export const viewport: Viewport = {
  themeColor: "#123d32",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

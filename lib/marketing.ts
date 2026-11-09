/**
 * Public marketing configuration for the platform homepage and legal pages.
 * Contact values come from deployment environment variables so no personal
 * number or address is committed to source.
 */

export type FoundingPlan = {
  id: "starter" | "growth" | "scale" | "chain";
  name: string;
  beds: string;
  listPrice: string | null;
  foundingPrice: string | null;
  perMonth: string | null;
  includes: string[];
  highlight?: boolean;
};

export const FOUNDING_PLANS: FoundingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    beds: "Up to 60 beds",
    listPrice: "₹14,999",
    foundingPrice: "₹8,999",
    perMonth: "about ₹750 a month",
    includes: ["Free setup from your register or Excel", "WhatsApp rent reminders and payment links", "UPI and cash review, receipts, reversals"],
  },
  {
    id: "growth",
    name: "Growth",
    beds: "61 to 120 beds",
    listPrice: "₹24,999",
    foundingPrice: "₹14,999",
    perMonth: "about ₹1,250 a month",
    includes: ["Everything in Starter", "Logins for managers and staff", "Owner approval on every cash entry"],
    highlight: true,
  },
  {
    id: "scale",
    name: "Scale",
    beds: "121 to 200 beds",
    listPrice: "₹34,999",
    foundingPrice: "₹20,999",
    perMonth: "about ₹1,750 a month",
    includes: ["Everything in Growth", "Priority WhatsApp support", "Monthly collection review with the founder"],
  },
  {
    id: "chain",
    name: "Chain",
    beds: "200+ beds or 3+ properties",
    listPrice: null,
    foundingPrice: null,
    perMonth: null,
    includes: ["Everything in Scale", "Your own brand and domain", "Custom pilot and onboarding plan"],
  },
];

export const FOUNDING_TOTAL_SPOTS = 10;

function digits(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function publicWhatsAppNumber() {
  const number = digits(process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER);
  return /^\d{10,15}$/.test(number) ? number : "";
}

export function formattedWhatsAppNumber() {
  const number = publicWhatsAppNumber();
  if (!number) return "";
  if (number.length === 12 && number.startsWith("91")) {
    return `+91 ${number.slice(2, 7)} ${number.slice(7)}`;
  }
  return `+${number}`;
}

export function whatsAppLink(message: string) {
  const number = publicWhatsAppNumber();
  if (!number) return "";
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export const DEMO_REQUEST_MESSAGE = "Hi PGFlow, I run a PG with __ beds in __ and want a 15-minute demo.";
export const FOUNDING_REQUEST_MESSAGE = "Hi PGFlow, I want to apply for a Founding PG spot. My PG has __ beds in __.";

/** WhatsApp click-to-chat for a demo, falling back to the assisted signup page. */
export function demoBookingHref(message = DEMO_REQUEST_MESSAGE) {
  return whatsAppLink(message) || "/signup";
}

export function contactEmail() {
  const email = (process.env.NEXT_PUBLIC_PGFLOW_CONTACT_EMAIL ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "hello@pgflow.co";
}

export function businessCity() {
  return (process.env.NEXT_PUBLIC_PGFLOW_CITY ?? "").trim() || "Greater Noida, Uttar Pradesh, India";
}

export function legalBusinessName() {
  return (process.env.NEXT_PUBLIC_PGFLOW_LEGAL_NAME ?? "").trim();
}

export function publicDemoUrl() {
  const value = (process.env.NEXT_PUBLIC_PGFLOW_DEMO_URL ?? "").trim();
  return /^https:\/\/[^\s]+$/.test(value) ? value : "";
}

export function foundingSpotsLeft() {
  const parsed = Number.parseInt(process.env.NEXT_PUBLIC_PGFLOW_FOUNDING_SPOTS_LEFT ?? "", 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, 0), FOUNDING_TOTAL_SPOTS);
}

export const FOUNDER = {
  name: "Ashwini Kumar",
  role: "Founder, PGFlow",
};

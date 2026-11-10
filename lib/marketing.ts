/**
 * Public marketing configuration for the platform homepage and legal pages.
 * Contact values come from deployment environment variables so no personal
 * number or address is committed to source.
 */

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

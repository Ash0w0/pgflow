import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("platform root renders the business homepage while tenant hosts retain the workspace", async () => {
  const source = await read("app/page.tsx");
  assert.match(source, /isPlatformLoginHostname/);
  assert.match(source, /<BusinessHomepage \/>/);
  assert.match(source, /requireStaffPage\(\["owner", "manager", "accountant"\]\)/);
});

test("homepage exposes the production entry points and the register story", async () => {
  const source = await read("components/business-homepage.tsx");
  assert.match(source, /Run your PG from WhatsApp\./);
  assert.match(source, /href="\/login"/);
  assert.match(source, /Resident → WhatsApp → owner/);
  assert.match(source, /Book a 15-min demo/);
  assert.match(source, /demoBookingHref\(/);
  assert.match(source, /Founding PG/);
  assert.match(source, /href="\/privacy"/);
  assert.match(source, /href="\/terms"/);
  assert.match(source, /<HeroRelay \/>/);
  assert.match(source, /<FirstOfMonth \/>/);
  assert.match(source, /<RegisterCompare \/>/);
});

test("homepage copy stays honest: no prices, fake proof, fictional brands or em dashes", async () => {
  const files = [
    "components/business-homepage.tsx",
    "components/home/hero-relay.tsx",
    "components/home/first-of-month.tsx",
    "components/home/how-it-works.tsx",
    "components/home/register-compare.tsx",
    "components/home/leak-meter.tsx",
    "components/home/closing-composer.tsx",
  ];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /fictional|Nivasa/i, file);
    assert.doesNotMatch(source, /FOUNDING_PLANS|per bed per month|\/month|testimonial|trusted by/i, `${file}: no pricing or invented social proof`);
    assert.doesNotMatch(source, /\u2014/, `${file}: no em dashes`);
  }
  const page = await read("components/business-homepage.tsx");
  assert.doesNotMatch(page, /₹\d/, "PGFlow prices stay off the public homepage");
});

test("demo booking falls back to assisted signup when no WhatsApp number is configured", async () => {
  const source = await read("lib/marketing.ts");
  assert.match(source, /NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER/);
  assert.match(source, /https:\/\/wa\.me\//);
  assert.match(source, /\|\| "\/signup"/);
  assert.doesNotMatch(source, /\b91\d{10}\b/, "no phone number is committed to source");
});

test("privacy policy and terms pages exist and name a grievance contact", async () => {
  const privacy = await read("app/privacy/page.tsx");
  const terms = await read("app/terms/page.tsx");
  assert.match(privacy, /Digital Personal Data Protection Act, 2023/);
  assert.match(privacy, /Grievance contact/);
  assert.match(terms, /not a bank, payment gateway or payment aggregator/);
  assert.match(terms, /30 days/);
  assert.match(terms, /Patna, Bihar/);
  const marketing = await read("lib/marketing.ts");
  assert.match(marketing, /UDYAM-BR-26-0259441/);
});

test("animated homepage scenes respect reduced motion without hydration mismatches", async () => {
  const hook = await read("components/home/use-reduced-motion.ts");
  assert.match(hook, /useSyncExternalStore/);
  for (const file of ["hero-relay", "first-of-month", "how-it-works", "reveal", "closing-composer", "leak-meter"]) {
    const source = await read(`components/home/${file}.tsx`);
    assert.match(source, /usePrefersReducedMotion\(\)/, file);
    assert.doesNotMatch(source, /useReducedMotion\(\)/, `${file} must use the hydration-safe hook`);
  }
  const relay = await read("components/home/hero-relay.tsx");
  assert.match(relay, /aria-pressed/);
  assert.match(relay, /Pause the walkthrough/);
  const css = await read("components/home/home.css");
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("signup prepares a reviewed WhatsApp message without posting owner data", async () => {
  const source = await read("components/signup-onboarding-form.tsx");
  assert.match(source, /https:\/\/wa\.me\//);
  assert.match(source, /Your details stay in your browser/);
  assert.doesNotMatch(source, /fetch\(|axios|XMLHttpRequest/);
});

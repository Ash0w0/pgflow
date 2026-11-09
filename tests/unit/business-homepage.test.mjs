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

test("homepage exposes the production entry points and approved workflow story", async () => {
  const source = await read("components/business-homepage.tsx");
  assert.match(source, /Run your PG from WhatsApp\./);
  assert.match(source, /href="\/login"/);
  assert.match(source, /Resident → WhatsApp → owner/);
  assert.match(source, /Book a 15-min demo/);
  assert.match(source, /demoBookingHref\(/);
  assert.match(source, /Founding PG/);
  assert.match(source, /href="\/privacy"/);
  assert.match(source, /href="\/terms"/);
  assert.doesNotMatch(source, /fictional|Nivasa/i);
  assert.doesNotMatch(source, /\u2014/, "homepage copy uses no em dashes");
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
});

test("Remotion player respects reduced motion and keeps visible controls", async () => {
  const source = await read("components/homepage-workflow-player.tsx");
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /autoPlay=\{!prefersReducedMotion\}/);
  assert.match(source, /controls/);
  assert.match(source, /showVolumeControls=\{false\}/);
});

test("signup prepares a reviewed WhatsApp message without posting owner data", async () => {
  const source = await read("components/signup-onboarding-form.tsx");
  assert.match(source, /https:\/\/wa\.me\//);
  assert.match(source, /Your details stay in your browser/);
  assert.doesNotMatch(source, /fetch\(|axios|XMLHttpRequest/);
});

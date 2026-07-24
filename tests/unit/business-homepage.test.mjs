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
  assert.match(source, /href="\/signup"/);
  assert.match(source, /href="\/login"/);
  assert.match(source, /Resident → WhatsApp → owner/);
  assert.match(source, /first two residents/i);
  assert.doesNotMatch(source, /fictional|demo|Nivasa/i);
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

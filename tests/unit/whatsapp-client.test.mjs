import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeWhatsAppPhone, sendWhatsAppTemplate } from "../../lib/whatsapp/client.ts";
import { getRentDueReminderPreview } from "../../lib/whatsapp/templates.ts";

const root = new URL("../../", import.meta.url);

test("normalizes Indian mobile numbers into Meta E.164 format", () => {
  assert.equal(normalizeWhatsAppPhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("09876543210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("9876543210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("919876543210"), "919876543210");
  assert.throws(() => normalizeWhatsAppPhone("12345"), /Invalid Indian mobile phone number/);
});

test("renders readable English and Hindi reminder previews", () => {
  const params = {
    recipientPhone: "919876543210",
    residentName: "Mira Kapoor",
    amount: 8500,
    billingPeriod: "July 2026",
    pgName: "Sample PG",
    dueDate: "05 July 2026",
    paymentUrl: "https://sample.pgflow.co/pay/link-123",
  };
  assert.match(getRentDueReminderPreview({ ...params, language: "en" }), /₹8,500/);
  const hindi = getRentDueReminderPreview({ ...params, language: "hi" });
  assert.match(hindi, /नमस्ते Mira Kapoor!/);
  assert.match(hindi, /किराया/);
});

test("only explicit demo runtime simulates a provider acceptance", async () => {
  process.env.PGFLOW_RUNTIME = "demo";
  const result = await sendWhatsAppTemplate({
    recipientPhone: "9876543210",
    templateName: "pgflow_rent_reminder_en",
    languageCode: "en",
  });
  assert.equal(result.ok, true);
  assert.equal(result.outcome, "provider_accepted");
  assert.equal(result.demo, true);
});

test("durable transport migration includes dedupe, leases, uncertain delivery and RLS", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/0034_production_whatsapp_journey.sql", root),
    "utf8",
  );
  assert.match(migration, /create table public\.whatsapp_webhook_events/i);
  assert.match(migration, /provider_event_key text not null unique/i);
  assert.match(migration, /create table public\.whatsapp_outbox_jobs/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /delivery_uncertain/i);
  assert.match(migration, /alter table public\.whatsapp_action_challenges enable row level security/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeWhatsAppPhone, sendWhatsAppTemplate } from "../../lib/whatsapp/client.ts";
import {
  getRentDueReminderPreview,
  getPaymentReceiptPreview,
  getDailyOwnerDigestPreview,
} from "../../lib/whatsapp/templates.ts";

const root = new URL("../../", import.meta.url);

test("normalizes Indian mobile numbers into Meta E.164 format", () => {
  assert.equal(normalizeWhatsAppPhone("+91 98765-43210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("09876543210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("9876543210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("919876543210"), "919876543210");

  assert.throws(() => normalizeWhatsAppPhone("12345"), /Invalid Indian mobile phone number/);
});

test("generates English and Hindi rent due reminder previews", () => {
  const params = {
    recipientPhone: "919876543210",
    residentName: "Mira Kapoor",
    amount: 8500,
    billingPeriod: "July 2026",
    pgName: "Sample PG",
    dueDate: "05 July 2026",
    paymentUrl: "http://localhost:3001/pay/link-123",
  };

  const enPreview = getRentDueReminderPreview({ ...params, language: "en" });
  assert.match(enPreview, /Namaste Mira Kapoor!/);
  assert.match(enPreview, /₹8,500/);
  assert.match(enPreview, /Sample PG/);

  const hiPreview = getRentDueReminderPreview({ ...params, language: "hi" });
  assert.match(hiPreview, /नमस्ते Mira Kapoor!/);
  assert.match(hiPreview, /₹8,500/);
  assert.match(hiPreview, /किराया/);
});

test("generates 8:00 PM daily owner digest preview", () => {
  const digestPreview = getDailyOwnerDigestPreview({
    ownerPhone: "919876543210",
    ownerName: "Rohan Sharma",
    dateStr: "2026-07-21",
    todayCollections: 45000,
    collectionsCount: 4,
    pendingAmount: 24000,
    pendingCount: 3,
    occupiedBeds: 48,
    vacantBeds: 2,
    openTickets: 1,
  });

  assert.match(digestPreview, /PGFlow Daily Digest for Rohan Sharma/);
  assert.match(digestPreview, /Today's Collection\*: ₹45,000/);
  assert.match(digestPreview, /48 occupied, 2 vacant/);
  assert.match(digestPreview, /1 tickets/);
});

test("dispatches demo mode mock WhatsApp templates cleanly", async () => {
  const result = await sendWhatsAppTemplate({
    recipientPhone: "9876543210",
    templateName: "pgflow_rent_due_en",
    languageCode: "en",
  });

  assert.equal(result.ok, true);
  assert.match(result.wamid, /^wamid\./);
  assert.equal(result.demo, true);
});

test("verifies 0028 whatsapp message logs migration security contract", async () => {
  const rawMigration = await readFile(
    new URL("supabase/migrations/0028_whatsapp_message_logs.sql", root),
    "utf8"
  );
  const migration = rawMigration.replace(/\r\n/g, "\n");

  assert.match(migration, /create table if not exists public\.whatsapp_message_logs/i);
  assert.match(migration, /recipient_phone text not null/i);
  assert.match(migration, /idempotency_key text unique/i);
  assert.match(migration, /alter table public\.whatsapp_message_logs enable row level security/i);
  assert.match(migration, /grant select on public\.whatsapp_message_logs to service_role/i);
  assert.match(
    migration,
    /create or replace function public\.log_whatsapp_message/i
  );
  assert.match(migration, /security definer/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildPaymentReceiptPayload, buildRentDueReminderPayload } from "../../lib/whatsapp/templates.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("rent reminders carry six body variables ending with the payment link", () => {
  const payload = buildRentDueReminderPayload({
    recipientPhone: "919876543210", residentName: "Asha", amount: 8000, billingPeriod: "December 2026",
    pgName: "Sunrise PG", dueDate: "5 Dec", paymentUrl: "https://sunrise.pgflow.co/pay/x?token=y", language: "hi",
  });
  assert.equal(payload.templateName, "pgflow_rent_due_hi");
  assert.equal(payload.components.length, 1);
  assert.deepEqual(payload.components[0].parameters.map((parameter) => parameter.text),
    ["Asha", "8,000", "December 2026", "Sunrise PG", "5 Dec", "https://sunrise.pgflow.co/pay/x?token=y"]);
});

test("receipts carry six body variables ending with the receipt link", () => {
  const payload = buildPaymentReceiptPayload({
    recipientPhone: "919876543210", residentName: "Asha", amount: 8000, billingPeriod: "December 2026",
    receiptNumber: "RCP-1", receiptUrl: "https://sunrise.pgflow.co/receipt/t", pgName: "Sunrise PG",
  });
  assert.equal(payload.templateName, "pgflow_payment_receipt_en");
  assert.deepEqual(payload.components[0].parameters.map((parameter) => parameter.text),
    ["Asha", "8,000", "December 2026", "RCP-1", "Sunrise PG", "https://sunrise.pgflow.co/receipt/t"]);
});

test("automation is opt-in, queued transactionally and never runs for read-only PGs", async () => {
  const migration = await read("supabase/migrations/0040_whatsapp_automation.sql");
  assert.match(migration, /whatsapp_auto_reminders boolean not null default false/);
  assert.match(migration, /whatsapp_auto_receipts boolean not null default false/);
  assert.match(migration, /after insert on public\.receipts/);
  assert.match(migration, /organization_plan_status\(invoice\.organization_id\) <> 'expired'/);
  assert.match(migration, /on conflict \(idempotency_key\) do nothing/);
  assert.match(migration, /for update skip locked/);
});

test("the sender waits until WhatsApp is connected and links are stored as hashes", async () => {
  const [outbox, receiptRoute, crons] = await Promise.all([
    read("lib/whatsapp/outbox.ts"),
    read("app/receipt/[token]/route.ts"),
    read("vercel.json"),
  ]);
  assert.match(outbox, /if \(!result\.configured\) return result;/);
  assert.match(outbox, /token_hash: tokenHash/);
  assert.match(receiptRoute, /link\.organization_id !== tenant\.organizationId/);
  const schedule = JSON.parse(crons).crons.map((cron) => cron.path);
  assert.deepEqual(schedule.sort(), ["/api/cron/maintenance", "/api/cron/whatsapp-outbox", "/api/cron/whatsapp-reminders"]);
  assert.ok(!schedule.includes("/api/cron/daily-digest"), "the digest with placeholder figures is never scheduled");
});

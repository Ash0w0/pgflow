import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeWhatsAppPhone,
  sendWhatsAppTemplate,
  setWhatsAppTransportForTesting,
} from "../../lib/whatsapp/client.ts";
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

test("classifies Meta responses and ambiguous network failures behaviorally", async (t) => {
  const previousEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    PGFLOW_RUNTIME: process.env.PGFLOW_RUNTIME,
    PGFLOW_ENV: process.env.PGFLOW_ENV,
    WHATSAPP_SEND_MODE: process.env.WHATSAPP_SEND_MODE,
    WHATSAPP_TEST_RECIPIENTS: process.env.WHATSAPP_TEST_RECIPIENTS,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID,
    WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
    WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_WORKER_SECRET: process.env.WHATSAPP_WORKER_SECRET,
    WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION,
  };
  Object.assign(process.env, {
    NODE_ENV: "test",
    PGFLOW_RUNTIME: "production",
    PGFLOW_ENV: "staging",
    WHATSAPP_SEND_MODE: "allowlist",
    WHATSAPP_TEST_RECIPIENTS: "919876543210",
    WHATSAPP_ACCESS_TOKEN: "test-access-token",
    WHATSAPP_PHONE_NUMBER_ID: "test-phone-id",
    WHATSAPP_WABA_ID: "test-waba-id",
    WHATSAPP_APP_SECRET: "test-app-secret",
    WHATSAPP_VERIFY_TOKEN: "test-verify-token",
    WHATSAPP_WORKER_SECRET: "test-worker-secret",
    WHATSAPP_GRAPH_VERSION: "v23.0",
  });
  t.after(() => {
    setWhatsAppTransportForTesting(null);
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const sendWith = async (transport) => {
    setWhatsAppTransportForTesting(transport);
    return sendWhatsAppTemplate({
      recipientPhone: "9876543210",
      templateName: "pgflow_rent_reminder_en",
      languageCode: "en",
    });
  };

  const rateLimited = await sendWith(async () => Response.json(
    { error: { code: 4, message: "Rate limited" } },
    { status: 429 },
  ));
  assert.equal(rateLimited.outcome, "retryable");
  assert.equal(rateLimited.httpStatus, 429);

  const unavailable = await sendWith(async () => Response.json(
    { error: { code: 2, message: "Temporarily unavailable" } },
    { status: 503 },
  ));
  assert.equal(unavailable.outcome, "retryable");

  const invalid = await sendWith(async () => Response.json(
    { error: { code: 100, message: "Invalid template" } },
    { status: 400 },
  ));
  assert.equal(invalid.outcome, "permanent_failure");

  const missingWamid = await sendWith(async () => Response.json(
    { messages: [] },
    { status: 200 },
  ));
  assert.equal(missingWamid.outcome, "delivery_uncertain");

  const timedOut = await sendWith(async () => {
    throw new DOMException("Timed out", "AbortError");
  });
  assert.equal(timedOut.outcome, "delivery_uncertain");

  const accepted = await sendWith(async () => Response.json(
    { messages: [{ id: "wamid.test-accepted" }] },
    { status: 200 },
  ));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.outcome, "provider_accepted");
  assert.equal(accepted.wamid, "wamid.test-accepted");
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

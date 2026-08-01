import assert from "node:assert/strict";
import test from "node:test";
import {
  getWhatsAppDegradedReasons,
  secondsSince,
} from "../../lib/whatsapp/readiness.ts";

const readyInput = {
  sendMode: "allowlist",
  connectionState: "test",
  templatesReady: true,
  outboxWorkerAgeSeconds: 30,
  webhookWorkerAgeSeconds: 30,
  oldestOutboxAgeSeconds: null,
  oldestWebhookAgeSeconds: null,
  outboxDeadLetters: 0,
  webhookDeadLetters: 0,
};

test("WhatsApp readiness reports every actionable degraded subsystem", () => {
  assert.deepEqual(getWhatsAppDegradedReasons({
    ...readyInput,
    sendMode: "disabled",
    connectionState: "degraded",
    templatesReady: false,
    outboxWorkerAgeSeconds: 300,
    webhookWorkerAgeSeconds: null,
    oldestOutboxAgeSeconds: 301,
    oldestWebhookAgeSeconds: 900,
    outboxDeadLetters: 1,
    webhookDeadLetters: 2,
  }), [
    "sending_disabled",
    "connection_not_ready",
    "templates_incomplete",
    "outbox_worker_stale",
    "webhook_worker_stale",
    "outbox_backlog_stale",
    "webhook_backlog_stale",
    "outbox_dead_letters",
    "webhook_dead_letters",
  ]);
  assert.deepEqual(getWhatsAppDegradedReasons(readyInput), []);
});

test("readiness age calculation is deterministic and rejects invalid timestamps", () => {
  const now = new Date("2026-07-29T09:05:00.000Z").getTime();
  assert.equal(secondsSince("2026-07-29T09:00:00.000Z", now), 300);
  assert.equal(secondsSince("not-a-date", now), null);
  assert.equal(secondsSince(null, now), null);
});

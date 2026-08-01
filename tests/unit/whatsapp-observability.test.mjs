import assert from "node:assert/strict";
import test from "node:test";
import { logWhatsAppJobFailure, logWhatsAppWorkerFailure } from "../../lib/whatsapp/observability.ts";

test("worker failure logs are structured, correlated, and redact error details", () => {
  const originalConsoleError = console.error;
  const lines = [];
  console.error = (line) => lines.push(String(line));

  try {
    logWhatsAppWorkerFailure(
      "webhook",
      "iad1::request id with spaces",
      new TypeError("phone=919999999999 UTR=SECRET-UTR access_token=secret"),
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.level, "error");
  assert.equal(entry.event, "whatsapp_worker_failed");
  assert.equal(entry.scope, "webhook");
  assert.equal(entry.correlationId, "iad1::requestidwithspaces");
  assert.equal(entry.errorType, "TypeError");
  assert.equal(typeof entry.timestamp, "string");
  assert.equal(lines[0].includes("919999999999"), false);
  assert.equal(lines[0].includes("SECRET-UTR"), false);
  assert.equal(lines[0].includes("access_token"), false);
});

test("job failure logs expose safe correlation IDs without error details", () => {
  const originalConsoleError = console.error;
  const lines = [];
  console.error = (line) => lines.push(String(line));

  try {
    logWhatsAppJobFailure("outbox", {
      workerId: "outbox:iad1",
      jobId: "job-123",
      organizationId: "org-456",
      messageId: "message-789",
      providerWamid: "wamid.provider-1",
      attempt: 3,
    }, new Error("phone=919999999999 UTR=SECRET-UTR"));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.deepEqual({
    event: entry.event, scope: entry.scope, workerId: entry.workerId,
    jobId: entry.jobId, organizationId: entry.organizationId,
    messageId: entry.messageId, providerWamid: entry.providerWamid,
    attempt: entry.attempt, errorType: entry.errorType,
  }, {
    event: "whatsapp_job_failed", scope: "outbox", workerId: "outbox:iad1",
    jobId: "job-123", organizationId: "org-456", messageId: "message-789",
    providerWamid: "wamid.provider-1", attempt: 3, errorType: "Error",
  });
  assert.equal(lines[0].includes("SECRET-UTR"), false);
  assert.equal(lines[0].includes("919999999999"), false);
});

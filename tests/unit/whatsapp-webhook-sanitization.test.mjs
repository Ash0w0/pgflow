import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { sanitizeInboundWhatsAppMessage } from "../../lib/whatsapp/webhook-sanitization.ts";

test("START activation bearer tokens are hashed before durable persistence", () => {
  const token = "activation_token_1234567890";
  const message = {
    id: "wamid.activation",
    type: "text",
    text: { body: `START ${token}` },
  };

  const sanitized = sanitizeInboundWhatsAppMessage(message);
  const serialized = JSON.stringify(sanitized);

  assert.equal(sanitized.text.body, "START [TOKEN REDACTED]");
  assert.equal(
    sanitized.pgflow_activation_token_hash,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.equal(serialized.includes(token), false);
  assert.equal(message.text.body, `START ${token}`);
});

test("ordinary inbound messages are preserved", () => {
  const message = { id: "wamid.help", type: "text", text: { body: "HELP" } };
  assert.equal(sanitizeInboundWhatsAppMessage(message), message);
});

import { createHash } from "node:crypto";

type InboundMessage = {
  type?: string;
  text?: ({ body?: string } & Record<string, unknown>);
} & Record<string, unknown>;

const activationCommand = /^START\s+([A-Za-z0-9_-]{20,128})\s*$/i;

/**
 * Meta signatures are verified against the raw request first. Before the
 * durable webhook event is written, one-time START tokens are replaced by a
 * hash so retries remain possible without storing the bearer secret.
 */
export function sanitizeInboundWhatsAppMessage(message: InboundMessage) {
  const body = message.type === "text" ? message.text?.body : undefined;
  const match = typeof body === "string" ? body.match(activationCommand) : null;
  if (!match) return message;
  return {
    ...message,
    text: {
      ...message.text,
      body: "START [TOKEN REDACTED]",
    },
    pgflow_activation_token_hash: createHash("sha256").update(match[1]).digest("hex"),
  };
}

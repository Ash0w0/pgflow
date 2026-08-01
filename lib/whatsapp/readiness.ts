export type WhatsAppReadinessInput = {
  sendMode: "disabled" | "allowlist" | "live";
  connectionState: string | null;
  templatesReady: boolean;
  outboxWorkerAgeSeconds: number | null;
  webhookWorkerAgeSeconds: number | null;
  oldestOutboxAgeSeconds: number | null;
  oldestWebhookAgeSeconds: number | null;
  outboxDeadLetters: number;
  webhookDeadLetters: number;
};

const MAX_HEALTHY_AGE_SECONDS = 300;

export function secondsSince(value: string | null | undefined, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 1000));
}

export function getWhatsAppDegradedReasons(input: WhatsAppReadinessInput) {
  const reasons: string[] = [];
  if (input.sendMode === "disabled") reasons.push("sending_disabled");
  if (!input.connectionState) reasons.push("connection_missing");
  else if (!["test", "live"].includes(input.connectionState)) reasons.push("connection_not_ready");
  if (!input.templatesReady) reasons.push("templates_incomplete");
  if (
    input.outboxWorkerAgeSeconds === null
    || input.outboxWorkerAgeSeconds >= MAX_HEALTHY_AGE_SECONDS
  ) reasons.push("outbox_worker_stale");
  if (
    input.webhookWorkerAgeSeconds === null
    || input.webhookWorkerAgeSeconds >= MAX_HEALTHY_AGE_SECONDS
  ) reasons.push("webhook_worker_stale");
  if (
    input.oldestOutboxAgeSeconds !== null
    && input.oldestOutboxAgeSeconds >= MAX_HEALTHY_AGE_SECONDS
  ) reasons.push("outbox_backlog_stale");
  if (
    input.oldestWebhookAgeSeconds !== null
    && input.oldestWebhookAgeSeconds >= MAX_HEALTHY_AGE_SECONDS
  ) reasons.push("webhook_backlog_stale");
  if (input.outboxDeadLetters > 0) reasons.push("outbox_dead_letters");
  if (input.webhookDeadLetters > 0) reasons.push("webhook_dead_letters");
  return reasons;
}

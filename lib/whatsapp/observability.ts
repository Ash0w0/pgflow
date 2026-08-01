type WhatsAppWorkerScope = "combined" | "outbox" | "webhook";
type WhatsAppJobScope = "outbox" | "webhook";

export type WhatsAppFailureContext = {
  workerId: string;
  jobId: string;
  organizationId?: string | null;
  messageId?: string | null;
  providerWamid?: string | null;
  attempt?: number;
};

function safeLogToken(value: string, fallback: string) {
  const normalized = value.replace(/[^A-Za-z0-9:._-]/g, "").slice(0, 160);
  return normalized || fallback;
}

export function logWhatsAppWorkerFailure(
  scope: WhatsAppWorkerScope,
  correlationId: string,
  error: unknown,
) {
  const environment = safeLogToken(process.env.PGFLOW_ENV ?? "unknown", "unknown");
  const errorType = error instanceof Error
    ? safeLogToken(error.name, "Error")
    : "UnknownError";
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "whatsapp_worker_failed",
    scope,
    environment,
    correlationId: safeLogToken(correlationId, "unavailable"),
    errorType,
  }));
}

export function logWhatsAppJobFailure(
  scope: WhatsAppJobScope,
  context: WhatsAppFailureContext,
  error: unknown,
) {
  const errorType = error instanceof Error
    ? safeLogToken(error.name, "Error")
    : "UnknownError";
  const optionalToken = (value: string | null | undefined) => (
    value ? safeLogToken(value, "unavailable") : undefined
  );
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "whatsapp_job_failed",
    scope,
    environment: safeLogToken(process.env.PGFLOW_ENV ?? "unknown", "unknown"),
    workerId: safeLogToken(context.workerId, "unavailable"),
    jobId: safeLogToken(context.jobId, "unavailable"),
    organizationId: optionalToken(context.organizationId),
    messageId: optionalToken(context.messageId),
    providerWamid: optionalToken(context.providerWamid),
    attempt: context.attempt,
    errorType,
  }));
}

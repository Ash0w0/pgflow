/**
 * Official Meta WhatsApp Cloud API Integration Client for PGFlow.
 * Dispatches WhatsApp template messages and manages E.164 phone normalization.
 */

export interface SendWhatsAppTemplateOptions {
  recipientPhone: string;
  templateName: string;
  languageCode?: "en" | "hi";
  components?: Array<{
    type: "header" | "body" | "button";
    sub_type?: "url" | "quick_reply";
    index?: string;
    parameters: Array<{
      type: "text" | "currency" | "date_time" | "image" | "payload";
      text?: string;
      payload?: string;
      currency?: { fallback_value: string; code: string; amount_1000: number };
      image?: { link: string };
    }>;
  }>;
}

export interface WhatsAppSendResult {
  ok: boolean;
  wamid?: string;
  demo?: boolean;
  outcome?: "provider_accepted" | "retryable" | "delivery_uncertain" | "permanent_failure" | "suppressed";
  httpStatus?: number;
  providerErrorCode?: string;
  error?: string;
}

import { getWhatsAppConfig } from "./config.ts";

type WhatsAppTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

let whatsappTransport: WhatsAppTransport = (input, init) => fetch(input, init);

/**
 * Installs a deterministic transport for behavioral tests without exposing an
 * environment-variable backdoor in deployed builds.
 */
export function setWhatsAppTransportForTesting(
  transport: WhatsAppTransport | null,
) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The WhatsApp test transport is only available in NODE_ENV=test.");
  }
  whatsappTransport = transport ?? ((input, init) => fetch(input, init));
}

/**
 * Normalizes Indian phone numbers to Meta E.164 format (e.g. 919876543210).
 */
export function normalizeWhatsAppPhone(phone: string): string {
  if (!phone) throw new Error("Phone number is required.");

  // Remove non-digit characters
  let cleaned = phone.replace(/\D/g, "");

  // Convert 10-digit Indian mobile (starts with 6-9) to 91XXXXXXXXXX
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = `91${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = `91${cleaned.slice(1)}`;
  }

  // Validate E.164 Indian mobile regex
  if (!/^91[6-9]\d{9}$/.test(cleaned)) {
    throw new Error(`Invalid Indian mobile phone number: '${phone}'`);
  }

  return cleaned;
}

/**
 * Dispatches an approved WhatsApp template. Only explicit demo runtime simulates.
 */
export async function sendWhatsAppTemplate(
  options: SendWhatsAppTemplateOptions
): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizeWhatsAppPhone(options.recipientPhone);
  const languageCode = options.languageCode || "en";

  const config = getWhatsAppConfig();

  if (config.runtime === "demo") {
    const mockWamid = `wamid.HBgL${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    return {
      ok: true,
      wamid: mockWamid,
      demo: true,
      outcome: "provider_accepted",
    };
  }

  if (config.sendMode === "disabled") {
    return { ok: false, outcome: "suppressed", error: "WhatsApp sending is disabled." };
  }
  if (config.sendMode === "allowlist" && !config.allowlist.has(normalizedPhone)) {
    return { ok: false, outcome: "suppressed", error: "Recipient is not in the staging allowlist." };
  }

  const graphUrl = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizedPhone,
    type: "template",
    template: {
      name: options.templateName,
      language: { code: languageCode },
      components: options.components || [],
    },
  };

  try {
    const res = await whatsappTransport(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await res.json()) as {
      error?: { message?: string; code?: number | string };
      messages?: Array<{ id?: string }>;
    };
    if (!res.ok) {
      const msg = data.error?.message || "Failed to dispatch WhatsApp message via Meta Cloud API.";
      const retryable = res.status === 429 || res.status >= 500;
      return {
        ok: false,
        outcome: retryable ? "retryable" : "permanent_failure",
        httpStatus: res.status,
        providerErrorCode: data.error?.code ? String(data.error.code) : undefined,
        error: msg,
      };
    }

    const wamid = data.messages?.[0]?.id;
    if (!wamid) {
      return {
        ok: false,
        outcome: "delivery_uncertain",
        httpStatus: res.status,
        error: "Meta accepted the request without returning a message identifier.",
      };
    }
    return { ok: true, wamid, outcome: "provider_accepted", httpStatus: res.status };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Meta API.";
    return {
      ok: false,
      outcome: "delivery_uncertain",
      error: errorMsg,
    };
  }
}

export async function sendWhatsAppText(
  recipientPhone: string,
  body: string,
): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizeWhatsAppPhone(recipientPhone);
  const config = getWhatsAppConfig();
  if (config.runtime === "demo") {
    return { ok: true, demo: true, wamid: `wamid.demo.${crypto.randomUUID()}`, outcome: "provider_accepted" };
  }
  if (config.sendMode === "disabled") return { ok: false, outcome: "suppressed", error: "WhatsApp sending is disabled." };
  if (config.sendMode === "allowlist" && !config.allowlist.has(normalizedPhone)) {
    return { ok: false, outcome: "suppressed", error: "Recipient is not in the staging allowlist." };
  }
  try {
    const response = await whatsappTransport(
      `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${config.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedPhone,
          type: "text",
          text: { preview_url: false, body: body.slice(0, 1000) },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const data = await response.json() as { messages?: Array<{ id?: string }>; error?: { code?: string | number; message?: string } };
    if (!response.ok) return {
      ok: false,
      outcome: response.status === 429 || response.status >= 500 ? "retryable" : "permanent_failure",
      httpStatus: response.status,
      providerErrorCode: data.error?.code ? String(data.error.code) : undefined,
      error: data.error?.message ?? "Meta text delivery failed.",
    };
    const wamid = data.messages?.[0]?.id;
    if (!wamid) return {
      ok: false,
      outcome: "delivery_uncertain",
      httpStatus: response.status,
      error: "Meta accepted the request without returning a message identifier.",
    };
    return { ok: true, outcome: "provider_accepted", httpStatus: response.status, wamid };
  } catch (error) {
    return { ok: false, outcome: "delivery_uncertain", error: error instanceof Error ? error.message : "Meta delivery timed out." };
  }
}

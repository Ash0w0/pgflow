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
      type: "text" | "currency" | "date_time" | "image";
      text?: string;
      currency?: { fallback_value: string; code: string; amount_1000: number };
      image?: { link: string };
    }>;
  }>;
}

export interface WhatsAppSendResult {
  ok: boolean;
  wamid?: string;
  demo?: boolean;
  error?: string;
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
 * Dispatches a WhatsApp Template message via Meta Graph API v18.0 or demo mock.
 */
export async function sendWhatsAppTemplate(
  options: SendWhatsAppTemplateOptions
): Promise<WhatsAppSendResult> {
  const normalizedPhone = normalizeWhatsAppPhone(options.recipientPhone);
  const languageCode = options.languageCode || "en";

  const isDemo =
    process.env.PGFLOW_RUNTIME === "demo" ||
    !process.env.WHATSAPP_TOKEN ||
    !process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (isDemo) {
    const mockWamid = `wamid.HBgL${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    return {
      ok: true,
      wamid: mockWamid,
      demo: true,
    };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

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
    const res = await fetch(graphUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      error?: { message?: string };
      messages?: Array<{ id?: string }>;
    };
    if (!res.ok) {
      const msg = data.error?.message || "Failed to dispatch WhatsApp message via Meta Cloud API.";
      return { ok: false, error: msg };
    }

    const wamid = data.messages?.[0]?.id;
    return { ok: true, wamid };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting Meta API.";
    return { ok: false, error: errorMsg };
  }
}

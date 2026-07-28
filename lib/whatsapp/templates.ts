import type { SendWhatsAppTemplateOptions } from "./client.ts";

export interface RentDueReminderParams {
  recipientPhone: string;
  residentName: string;
  amount: number;
  billingPeriod: string;
  pgName: string;
  dueDate: string;
  paymentUrl: string;
  language?: "en" | "hi";
}

export interface PaymentReceiptParams {
  recipientPhone: string;
  residentName: string;
  amount: number;
  billingPeriod: string;
  receiptNumber: string;
  receiptUrl: string;
  language?: "en" | "hi";
}

export function buildRentDueReminderPayload(params: RentDueReminderParams): SendWhatsAppTemplateOptions {
  const language = params.language || "en";
  return {
    recipientPhone: params.recipientPhone,
    templateName: `pgflow_rent_reminder_${language}`,
    languageCode: language,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.residentName },
          { type: "text", text: params.amount.toLocaleString("en-IN") },
          { type: "text", text: params.billingPeriod },
          { type: "text", text: params.pgName },
          { type: "text", text: params.dueDate },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: params.paymentUrl }],
      },
    ],
  };
}

export function getRentDueReminderPreview(params: RentDueReminderParams) {
  const amount = params.amount.toLocaleString("en-IN");
  if (params.language === "hi") {
    return `नमस्ते ${params.residentName}! ${params.pgName} में ${params.billingPeriod} का ₹${amount} किराया ${params.dueDate} तक देय है।\n\nसुरक्षित भुगतान लिंक: ${params.paymentUrl}`;
  }
  return `Namaste ${params.residentName}! Your rent of ₹${amount} for ${params.billingPeriod} at ${params.pgName} is due on ${params.dueDate}.\n\nSecure payment link: ${params.paymentUrl}`;
}

export function buildPaymentReceiptPayload(params: PaymentReceiptParams): SendWhatsAppTemplateOptions {
  const language = params.language || "en";
  return {
    recipientPhone: params.recipientPhone,
    templateName: `pgflow_receipt_${language}`,
    languageCode: language,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.residentName },
          { type: "text", text: params.amount.toLocaleString("en-IN") },
          { type: "text", text: params.billingPeriod },
          { type: "text", text: params.receiptNumber },
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: params.receiptUrl }],
      },
    ],
  };
}

export function getPaymentReceiptPreview(params: PaymentReceiptParams) {
  const amount = params.amount.toLocaleString("en-IN");
  if (params.language === "hi") {
    return `धन्यवाद ${params.residentName}! ${params.billingPeriod} के लिए ₹${amount} का भुगतान स्वीकृत हुआ। रसीद: ${params.receiptNumber}\n\nरसीद देखें: ${params.receiptUrl}`;
  }
  return `Thank you ${params.residentName}! Payment of ₹${amount} for ${params.billingPeriod} was approved. Receipt: ${params.receiptNumber}\n\nView receipt: ${params.receiptUrl}`;
}

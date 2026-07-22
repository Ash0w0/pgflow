/**
 * Bilingual WhatsApp Template Engines (English & Hindi) for PGFlow.
 * Builds Meta-compliant parameters and readable preview text.
 */

import type { SendWhatsAppTemplateOptions } from "./client";

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

export interface DailyOwnerDigestParams {
  ownerPhone: string;
  ownerName: string;
  dateStr: string;
  todayCollections: number;
  collectionsCount: number;
  pendingAmount: number;
  pendingCount: number;
  occupiedBeds: number;
  vacantBeds: number;
  openTickets: number;
}

/**
 * Builds Meta API template payload for Rent Due Reminder (T-3, T-0, T+2).
 */
export function buildRentDueReminderPayload(
  params: RentDueReminderParams
): SendWhatsAppTemplateOptions {
  const lang = params.language || "en";
  const templateName = `pgflow_rent_due_${lang}`;
  const formattedAmount = params.amount.toLocaleString("en-IN");

  return {
    recipientPhone: params.recipientPhone,
    templateName,
    languageCode: lang,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.residentName },
          { type: "text", text: formattedAmount },
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

/**
 * Generates human-readable preview text for Rent Due Reminder.
 */
export function getRentDueReminderPreview(params: RentDueReminderParams): string {
  const lang = params.language || "en";
  const formattedAmount = params.amount.toLocaleString("en-IN");

  if (lang === "hi") {
    return `नमस्ते ${params.residentName}! ${params.pgName} में ${params.billingPeriod} का आपका ₹${formattedAmount} का किराया ${params.dueDate} तक देय है।\n\nभुगतान लिंक: ${params.paymentUrl}`;
  }

  return `Namaste ${params.residentName}! Your rent of ₹${formattedAmount} for ${params.billingPeriod} at ${params.pgName} is due on ${params.dueDate}.\n\nPay online: ${params.paymentUrl}`;
}

/**
 * Builds Meta API template payload for Instant Payment Receipt.
 */
export function buildPaymentReceiptPayload(
  params: PaymentReceiptParams
): SendWhatsAppTemplateOptions {
  const lang = params.language || "en";
  const templateName = `pgflow_payment_receipt_${lang}`;
  const formattedAmount = params.amount.toLocaleString("en-IN");

  return {
    recipientPhone: params.recipientPhone,
    templateName,
    languageCode: lang,
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.residentName },
          { type: "text", text: formattedAmount },
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

/**
 * Generates human-readable preview text for Payment Receipt.
 */
export function getPaymentReceiptPreview(params: PaymentReceiptParams): string {
  const lang = params.language || "en";
  const formattedAmount = params.amount.toLocaleString("en-IN");

  if (lang === "hi") {
    return `धन्यवाद ${params.residentName}! ₹${formattedAmount} (${params.billingPeriod}) का भुगतान प्राप्त हो गया है। रसीद संख्या: ${params.receiptNumber}\n\nरसीद देखें: ${params.receiptUrl}`;
  }

  return `Thank you ${params.residentName}! Payment of ₹${formattedAmount} for ${params.billingPeriod} has been received. Official receipt: ${params.receiptNumber}\n\nView receipt: ${params.receiptUrl}`;
}

/**
 * Builds Meta API template payload for 8:00 PM Daily Owner Digest.
 */
export function buildDailyOwnerDigestPayload(
  params: DailyOwnerDigestParams
): SendWhatsAppTemplateOptions {
  const formattedCollections = params.todayCollections.toLocaleString("en-IN");
  const formattedPending = params.pendingAmount.toLocaleString("en-IN");

  return {
    recipientPhone: params.ownerPhone,
    templateName: "pgflow_daily_owner_digest_en",
    languageCode: "en",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: params.ownerName },
          { type: "text", text: params.dateStr },
          { type: "text", text: formattedCollections },
          { type: "text", text: String(params.collectionsCount) },
          { type: "text", text: formattedPending },
          { type: "text", text: String(params.pendingCount) },
          { type: "text", text: String(params.occupiedBeds) },
          { type: "text", text: String(params.vacantBeds) },
          { type: "text", text: String(params.openTickets) },
        ],
      },
    ],
  };
}

/**
 * Generates human-readable preview text for 8:00 PM Daily Owner Digest.
 */
export function getDailyOwnerDigestPreview(params: DailyOwnerDigestParams): string {
  const formattedCollections = params.todayCollections.toLocaleString("en-IN");
  const formattedPending = params.pendingAmount.toLocaleString("en-IN");

  return `📊 *PGFlow Daily Digest for ${params.ownerName} (${params.dateStr})*\n\n` +
    `• *Today's Collection*: ₹${formattedCollections} (${params.collectionsCount} payments)\n` +
    `• *Pending Dues*: ₹${formattedPending} (${params.pendingCount} residents)\n` +
    `• *Occupancy*: ${params.occupiedBeds} occupied, ${params.vacantBeds} vacant beds\n` +
    `• *Open Maintenance*: ${params.openTickets} tickets\n\n` +
    `Have a peaceful evening!`;
}

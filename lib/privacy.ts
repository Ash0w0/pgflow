/**
 * DPDP (Digital Personal Data Protection Act, 2023) compliance utilities.
 * Maintains a registry of PII fields, masking functions, and retention policies.
 */

/**
 * Exhaustive registry of all database columns containing Personally Identifiable Information.
 * Every PII field in the schema must be registered here.
 */
export const PII_FIELDS = Object.freeze({
  tenants: ["full_name", "phone", "alternate_phone", "emergency_contact_name", "emergency_contact_phone", "address"],
  memberships: ["display_name"],
  owner_invitations: ["display_name", "phone_e164"],
  maintenance_tickets: ["reporter_name"],
  invoices: ["resident_name"],
  whatsapp_message_logs: ["recipient_phone"],
  whatsapp_contacts: ["display_name", "phone_e164"],
  whatsapp_conversations: ["phone_e164"],
} as const);

/**
 * All registered PII field names (flattened).
 */
export const ALL_PII_FIELD_NAMES: readonly string[] = Object.freeze(
  Object.values(PII_FIELDS).flatMap((fields) => [...fields])
);

/**
 * Retention periods compliant with Indian tax law and DPDP Act.
 * Financial records: 8 years (Income Tax Act, Section 44AA).
 * PII: 3 years post-departure or upon erasure request.
 * Audit logs: indefinite (operational security).
 */
export const RETENTION_POLICY = Object.freeze({
  financialRecords: {
    tables: ["invoices", "payments", "payment_links", "invoice_line_items"],
    retentionYears: 8,
    basis: "Income Tax Act Section 44AA — books of account retention",
  },
  personalData: {
    tables: ["tenants", "whatsapp_contacts", "whatsapp_conversations", "whatsapp_consent_events"],
    retentionYears: 3,
    basis: "DPDP Act 2023 — purpose limitation after tenancy ends",
    triggerField: "departed_at",
  },
  auditLogs: {
    tables: ["provisioning_jobs", "resident_corrections", "audit_entries"],
    retentionYears: null, // indefinite
    basis: "Operational security — indefinite audit trail",
  },
} as const);

/**
 * Masks a phone number for display: +91 •••••• 3210
 */
export function maskPhone(phone: string): string {
  if (!phone) return "Phone unavailable";
  let cleaned = phone.replace(/\D/g, "");
  // Normalize bare 10-digit Indian mobile to 91XXXXXXXXXX
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = `91${cleaned}`;
  }
  if (cleaned.length >= 10) {
    return `+${cleaned.slice(0, 2)} •••••• ${cleaned.slice(-4)}`;
  }
  return "•••• " + cleaned.slice(-4);
}

/**
 * Masks a name for display: M•••• K••••
 */
export function maskName(name: string): string {
  if (!name || name.trim().length === 0) return "Name unavailable";
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? part : part[0] + "••••"))
    .join(" ");
}

/**
 * Masks all recognized PII fields in a record.
 * Non-PII fields pass through unchanged.
 */
export function maskPii(record: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...record };

  for (const [key, value] of Object.entries(masked)) {
    if (typeof value !== "string") continue;

    const lowerKey = key.toLowerCase();

    // Phone fields
    if (lowerKey.includes("phone") || lowerKey === "phone_e164" || lowerKey === "recipient_phone") {
      masked[key] = maskPhone(value);
      continue;
    }

    // Name fields
    if (
      lowerKey.includes("name") &&
      !lowerKey.includes("app_name") &&
      !lowerKey.includes("short_name") &&
      !lowerKey.includes("payee_name") &&
      !lowerKey.includes("template_name")
    ) {
      masked[key] = maskName(value);
      continue;
    }

    // Address fields
    if (lowerKey === "address") {
      masked[key] = "•••• (redacted)";
      continue;
    }
  }

  return masked;
}

/**
 * Calculates the retention expiry date for a financial record.
 */
export function financialRetentionExpiry(createdAt: Date | string): Date {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const expiry = new Date(created);
  expiry.setFullYear(expiry.getFullYear() + RETENTION_POLICY.financialRecords.retentionYears);
  return expiry;
}

/**
 * Calculates the retention expiry date for a departed resident's PII.
 */
export function piiRetentionExpiry(departedAt: Date | string): Date {
  const departed = typeof departedAt === "string" ? new Date(departedAt) : departedAt;
  const expiry = new Date(departed);
  expiry.setFullYear(expiry.getFullYear() + RETENTION_POLICY.personalData.retentionYears);
  return expiry;
}

/**
 * Checks whether a given date is past the retention window.
 */
export function isExpired(expiryDate: Date | string, now = new Date()): boolean {
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  return now > expiry;
}

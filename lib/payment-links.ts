import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase/admin";

const PAYMENT_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type PaymentLinkContext = {
  paymentRequestId: string;
  organizationId: string;
  propertyId: string;
  invoiceId: string;
  tenantId: string;
  expiresAt: string;
};

export function createPaymentLinkSecret() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPaymentLinkToken(token) };
}

export function hashPaymentLinkToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isPaymentLinkToken(token: string) {
  return PAYMENT_LINK_TOKEN_PATTERN.test(token);
}

export async function resolvePaymentLink(
  token: string,
  invoiceId: string,
  { recordOpen = false }: { recordOpen?: boolean } = {},
): Promise<PaymentLinkContext | null> {
  if (!isPaymentLinkToken(token) || !/^[0-9a-f-]{36}$/i.test(invoiceId)) return null;

  const admin = getSupabaseAdmin();
  const tokenHash = hashPaymentLinkToken(token);

  if (recordOpen) {
    const { data, error } = await admin.rpc("record_invoice_payment_request_open", {
      p_token_hash: tokenHash,
      p_invoice_id: invoiceId,
    });
    if (error || !data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    if (
      typeof row.paymentRequestId !== "string"
      || typeof row.organizationId !== "string"
      || typeof row.propertyId !== "string"
      || typeof row.invoiceId !== "string"
      || typeof row.tenantId !== "string"
      || typeof row.expiresAt !== "string"
    ) return null;
    return row as PaymentLinkContext;
  }

  const { data, error } = await admin
    .from("invoice_payment_requests")
    .select("id,organization_id,property_id,invoice_id,tenant_id,expires_at")
    .eq("token_hash", tokenHash)
    .eq("invoice_id", invoiceId)
    .eq("state", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;

  return {
    paymentRequestId: data.id,
    organizationId: data.organization_id,
    propertyId: data.property_id,
    invoiceId: data.invoice_id,
    tenantId: data.tenant_id,
    expiresAt: data.expires_at,
  };
}

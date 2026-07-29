import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function enqueuePaymentConfirmation(input: {
  organizationId: string;
  connectionId: string;
  contactId: string;
  languageCode: "en" | "hi";
  paymentId: string;
  decision: "approve" | "reject";
  inboundWamid: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc("enqueue_whatsapp_intent", {
    p_organization_id: input.organizationId,
    p_connection_id: input.connectionId,
    p_contact_id: input.contactId,
    p_kind: "payment_action_confirmation",
    p_language_code: input.languageCode,
    p_dedupe_key: `payment-confirm:${input.paymentId}:${input.decision}:${input.inboundWamid}`,
    p_intent: {
      kind: "payment_action_confirmation",
      paymentId: input.paymentId,
      decision: input.decision,
      inboundWamid: input.inboundWamid,
    },
    p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw error;
  return data;
}

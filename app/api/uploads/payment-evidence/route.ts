import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { resolvePaymentLink } from "@/lib/payment-links";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin evidence uploads are not allowed.", 403);

  const body = await request.formData();
  const upload = body.get("file");
  const invoiceId = String(body.get("invoiceId") ?? "").trim();
  const token = String(body.get("token") ?? "").trim();
  if (!(upload instanceof File) || !isUuid(invoiceId)) return jsonError("Invoice and screenshot are required.");
  if (!ACCEPTED_TYPES.has(upload.type)) return jsonError("Screenshot must be JPEG, PNG, or WebP.");
  if (upload.size <= 0 || upload.size > MAX_BYTES) return jsonError("Screenshot must be smaller than 5 MB.");

  const publicContext = token ? await resolvePaymentLink(token, invoiceId) : null;
  const actor = publicContext ? null : await requireActor(request, ["tenant", "owner", "manager", "accountant"]);
  if (!publicContext && !actor) return jsonError(token ? "This payment link is invalid or expired." : "An authenticated PG session is required.", 401);

  const organizationId = publicContext?.organizationId ?? actor!.organizationId;
  const propertyId = publicContext?.propertyId ?? actor?.propertyId;
  if (!propertyId) return jsonError("A property-scoped payment is required.", 403);

  const admin = getSupabaseAdmin();
  const { data: invoice, error: invoiceError } = await admin.from("invoices")
    .select("id,tenant_id,state")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .maybeSingle();
  const tenantMatches = publicContext
    ? invoice?.tenant_id === publicContext.tenantId
    : actor?.role !== "tenant" || invoice?.tenant_id === actor.tenantId;
  if (invoiceError || !invoice || !tenantMatches || !["issued", "partially_paid", "overdue"].includes(invoice.state)) {
    return jsonError("This invoice cannot accept payment evidence.", 403);
  }

  const bytes = await upload.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const extension = upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
  const objectKey = `organizations/${organizationId}/payment-evidence/${crypto.randomUUID()}.${extension}`;

  if (!readPublicSupabaseConfig()) return jsonError("Private document storage is not configured.", 503);
  const storage = publicContext ? admin.storage : (await getSupabaseServerClient()).storage;
  const { error } = await storage.from("payment-evidence").upload(objectKey, new Uint8Array(bytes), {
    contentType: upload.type,
    upsert: false,
    metadata: {
      organizationId,
      invoiceId,
      uploadedBy: publicContext ? `payment-request:${publicContext.paymentRequestId}` : actor!.id,
      sha256: hash,
    },
  });
  if (error) return jsonError("Payment evidence could not be stored.", 503);

  return Response.json({ objectKey, hash, contentType: upload.type, size: upload.size }, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}

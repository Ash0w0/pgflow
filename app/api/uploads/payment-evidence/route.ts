import { jsonError, requireActor } from "@/lib/http";
import { readPublicSupabaseConfig } from "@/lib/supabase/config";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const actor = await requireActor(request, ["tenant", "owner", "manager", "accountant"]);
  if (!actor) return jsonError("An authenticated PG session is required.", 401);

  const body = await request.formData();
  const upload = body.get("file");
  const invoiceId = String(body.get("invoiceId") ?? "").trim();
  if (!(upload instanceof File) || !invoiceId) return jsonError("Invoice and screenshot are required.");
  if (!ACCEPTED_TYPES.has(upload.type)) return jsonError("Screenshot must be JPEG, PNG, or WebP.");
  if (upload.size <= 0 || upload.size > MAX_BYTES) return jsonError("Screenshot must be smaller than 5 MB.");

  const invoiceQuery = getSupabaseAdmin().from("invoices").select("id,tenant_id,state")
    .eq("id", invoiceId).eq("organization_id", actor.organizationId);
  if (actor.propertyId) invoiceQuery.eq("property_id", actor.propertyId);
  const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();
  if (invoiceError || !invoice || !["issued", "partially_paid", "overdue"].includes(invoice.state) || (actor.role === "tenant" && invoice.tenant_id !== actor.tenantId)) {
    return jsonError("This invoice cannot accept payment evidence.", 403);
  }

  const bytes = await upload.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const extension = upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
  const objectKey = `organizations/${actor.organizationId}/payment-evidence/${crypto.randomUUID()}.${extension}`;

  if (!readPublicSupabaseConfig()) return jsonError("Private document storage is not configured.", 503);
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.storage.from("payment-evidence").upload(objectKey, new Uint8Array(bytes), {
    contentType: upload.type,
    upsert: false,
    metadata: { organizationId: actor.organizationId, invoiceId, uploadedBy: actor.id, sha256: hash },
  });
  if (error) return jsonError("Payment evidence could not be stored.", 503);

  return Response.json({ objectKey, hash, contentType: upload.type, size: upload.size }, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}

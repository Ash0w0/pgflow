import { env } from "cloudflare:workers";
import { jsonError, requireActor } from "@/lib/http";

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const actor = requireActor(request, ["tenant", "owner", "manager", "accountant"]);
  if (!actor) return jsonError("An authenticated PG session is required.", 401);

  const body = await request.formData();
  const upload = body.get("file");
  const invoiceId = String(body.get("invoiceId") ?? "").trim();
  if (!(upload instanceof File) || !invoiceId) return jsonError("Invoice and screenshot are required.");
  if (!ACCEPTED_TYPES.has(upload.type)) return jsonError("Screenshot must be JPEG, PNG, or WebP.");
  if (upload.size <= 0 || upload.size > MAX_BYTES) return jsonError("Screenshot must be smaller than 5 MB.");

  const bytes = await upload.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const extension = upload.type === "image/png" ? "png" : upload.type === "image/webp" ? "webp" : "jpg";
  const objectKey = `organizations/${actor.organizationId}/payment-evidence/${crypto.randomUUID()}.${extension}`;

  if (!env.DOCUMENTS) return jsonError("Private document storage is not configured.", 503);
  await env.DOCUMENTS.put(objectKey, bytes, {
    httpMetadata: { contentType: upload.type },
    customMetadata: { organizationId: actor.organizationId, invoiceId, uploadedBy: actor.id, sha256: hash },
  });

  return Response.json({ objectKey, hash, contentType: upload.type, size: upload.size }, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}

import { isValidPropertySlug } from "@/lib/domain";
import { jsonError, requireOperator } from "@/lib/http";
import { BLANK_TEMPLATE } from "@/lib/template";

const provisioningSteps = [
  "organization",
  "branding",
  "property_data",
  "owner_account",
  "upi_and_rules",
  "storage_namespace",
  "authorization_smoke_test",
  "billing_preview",
  "pwa_manifest",
];

export async function GET() {
  return Response.json({
    templateVersion: BLANK_TEMPLATE.version,
    blankTemplate: true,
    template: BLANK_TEMPLATE,
    copiesDemoRecords: false,
    targetAutomationMinutes: 15,
    coreHandoffHours: 4,
    steps: provisioningSteps,
  });
}

export async function POST(request: Request) {
  if (!requireOperator(request)) return jsonError("Platform operator authorization is required.", 403);
  const payload = await request.json() as { name?: string; slug?: string; ownerPhone?: string; idempotencyKey?: string };
  if (!payload.name?.trim()) return jsonError("PG name is required.");
  if (!payload.slug || !isValidPropertySlug(payload.slug)) return jsonError("Slug must use lowercase letters, numbers and internal hyphens.");
  if (!payload.ownerPhone?.trim()) return jsonError("Owner phone is required.");
  if (!payload.idempotencyKey?.trim()) return jsonError("An idempotency key is required.");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload.idempotencyKey));
  const jobId = `prv_${Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return Response.json({
    job: {
      id: jobId,
      state: "ready_to_provision",
      templateVersion: "1.0.0",
      organization: { name: payload.name.trim(), slug: payload.slug.trim() },
      steps: provisioningSteps.map((key, sortOrder) => ({ key, sortOrder, state: "pending" })),
      persisted: false,
      mode: "contract_preview",
    },
  }, { status: 202, headers: { "cache-control": "no-store" } });
}

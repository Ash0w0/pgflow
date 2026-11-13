import { consumeAuthenticationLimits } from "@/lib/auth-rate-limit";
import { summarizePlan } from "@/lib/plan";
import { normalizeHostname } from "@/lib/branding";
import { isValidPropertySlug } from "@/lib/domain";
import { jsonError, requireOperator, requireOperatorActor } from "@/lib/http";
import { isUuid, maskIndianPhone } from "@/lib/owner-invitations";
import { verifyOperatorPassword } from "@/lib/operator-reauth";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { BLANK_TEMPLATE } from "@/lib/template";
import { requestHostname } from "@/lib/tenancy";

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const DEFAULT_PRIMARY_COLOR = "#123d32";
const DEFAULT_ACCENT_COLOR = "#d7ff86";
const NO_STORE_HEADERS = { "cache-control": "no-store" };
const PROVISIONING_STATES = new Set([
  "draft",
  "awaiting_data",
  "validating",
  "ready_to_provision",
  "provisioning",
  "core_ready",
  "integrations_pending",
  "live",
  "failed",
]);

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

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function firstRpcRecord(value: unknown) {
  return asRecord(Array.isArray(value) ? value[0] : value);
}

function readString(record: JsonRecord, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

function derivePlatformHostname(slug: string) {
  const domain = normalizeHostname(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? null);
  if (
    !domain
    || domain.length > 253
    || (domain !== "localhost" && (!/^[a-z0-9.-]+$/.test(domain) || domain.includes("..") || domain.startsWith(".")))
  ) {
    return null;
  }
  const hostname = `${slug}.${domain}`;
  const operatorHostname = normalizeHostname(process.env.OPERATOR_HOSTNAME ?? null);
  return operatorHostname && hostname === operatorHostname ? null : hostname;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function demoRegistryResponse() {
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

async function demoProvisioningPreview(request: Request) {
  if (!await requireOperator(request)) return jsonError("Platform operator authorization is required.", 403);

  let payload: { name?: string; slug?: string; ownerPhone?: string; idempotencyKey?: string };
  try {
    payload = await request.json() as typeof payload;
  } catch {
    return jsonError("A valid JSON body is required.");
  }

  if (!payload.name?.trim()) return jsonError("PG name is required.");
  if (!payload.slug || !isValidPropertySlug(payload.slug)) return jsonError("Slug must use lowercase letters, numbers and internal hyphens.");
  if (!payload.ownerPhone?.trim()) return jsonError("Owner phone is required.");
  if (!payload.idempotencyKey?.trim()) return jsonError("An idempotency key is required.");

  const digest = await sha256Hex(payload.idempotencyKey);
  return Response.json({
    job: {
      id: `prv_${digest.slice(0, 24)}`,
      state: "ready_to_provision",
      templateVersion: BLANK_TEMPLATE.version,
      organization: { name: payload.name.trim(), slug: payload.slug.trim() },
      steps: provisioningSteps.map((key, sortOrder) => ({ key, sortOrder, state: "pending" })),
      persisted: false,
      mode: "contract_preview",
    },
  }, { status: 202, headers: NO_STORE_HEADERS });
}

export async function GET(request: Request) {
  if (isDemoRuntime()) return demoRegistryResponse();
  if (!await requireOperatorActor(request)) return jsonError("Platform operator authorization is required.", 403);

  const admin = getSupabaseAdmin();
  const [templateResult, organizationResult, domainResult, jobResult, invitationResult] = await Promise.all([
    admin
      .from("template_versions")
      .select("version")
      .eq("status", "current")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("id,name,slug,state,created_at,resident_limit,trial_ends_at,paid_until")
      .eq("demo_mode", false)
      .order("created_at", { ascending: false }),
    admin
      .from("domain_mappings")
      .select("organization_id,hostname")
      .eq("kind", "platform_subdomain")
      .eq("state", "verified"),
    admin
      .from("provisioning_jobs")
      .select("id,organization_id,state,updated_at")
      .order("updated_at", { ascending: false }),
    admin
      .from("staff_invitations")
      .select("id,organization_id,display_name,phone,state,expires_at,credential_state,temporary_password_expires_at,created_at")
      .eq("role", "owner")
      .in("state", ["pending", "accepted"])
      .order("created_at", { ascending: false }),
  ]);

  if (
    templateResult.error
    || !templateResult.data
    || organizationResult.error
    || domainResult.error
    || jobResult.error
    || invitationResult.error
  ) {
    return jsonError("The provisioning registry is temporarily unavailable.", 503);
  }

  const hostnameByOrganization = new Map<string, string>();
  for (const mapping of domainResult.data ?? []) {
    if (typeof mapping.organization_id === "string" && typeof mapping.hostname === "string") {
      hostnameByOrganization.set(mapping.organization_id, mapping.hostname);
    }
  }

  const jobByOrganization = new Map<string, { jobId: string; state: string; updatedAt: string }>();
  for (const job of jobResult.data ?? []) {
    if (
      typeof job.organization_id === "string"
      && typeof job.id === "string"
      && typeof job.state === "string"
      && typeof job.updated_at === "string"
      && !jobByOrganization.has(job.organization_id)
    ) {
      jobByOrganization.set(job.organization_id, {
        jobId: job.id,
        state: job.state,
        updatedAt: job.updated_at,
      });
    }
  }

  const invitationByOrganization = new Map<string, {
    id: string;
    displayName: string;
    maskedPhone: string;
    state: string;
    expiresAt: string;
    credentialState: string;
    temporaryPasswordExpiresAt: string | null;
  }>();
  for (const invitation of invitationResult.data ?? []) {
    if (
      typeof invitation.organization_id === "string"
      && typeof invitation.id === "string"
      && typeof invitation.display_name === "string"
      && typeof invitation.phone === "string"
      && typeof invitation.state === "string"
      && typeof invitation.expires_at === "string"
      && typeof invitation.credential_state === "string"
      && !invitationByOrganization.has(invitation.organization_id)
    ) {
      const temporaryPasswordExpiresAt = typeof invitation.temporary_password_expires_at === "string"
        ? invitation.temporary_password_expires_at
        : null;
      const temporaryPasswordExpired = invitation.credential_state === "temporary"
        && (!temporaryPasswordExpiresAt || Date.parse(temporaryPasswordExpiresAt) <= Date.now());
      invitationByOrganization.set(invitation.organization_id, {
        id: invitation.id,
        displayName: invitation.display_name,
        maskedPhone: maskIndianPhone(invitation.phone),
        state: invitation.state === "pending" && Date.parse(invitation.expires_at) <= Date.now()
          ? "expired"
          : invitation.state,
        expiresAt: invitation.expires_at,
        credentialState: temporaryPasswordExpired
          ? "temporary_password_expired"
          : invitation.credential_state,
        temporaryPasswordExpiresAt,
      });
    }
  }

  return Response.json({
    mode: "production",
    template: {
      version: templateResult.data.version,
      blankTemplate: true,
      copiesDemoRecords: false,
    },
    organizations: (organizationResult.data ?? []).map((organization) => ({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      state: organization.state,
      hostname: hostnameByOrganization.get(organization.id) ?? null,
      createdAt: organization.created_at,
      residentLimit: typeof organization.resident_limit === "number" ? organization.resident_limit : 2,
      plan: summarizePlan(organization.trial_ends_at, organization.paid_until),
      trialEndsAt: organization.trial_ends_at ?? null,
      paidUntil: organization.paid_until ?? null,
      provisioning: jobByOrganization.get(organization.id) ?? null,
      ownerInvitation: invitationByOrganization.get(organization.id) ?? null,
    })),
  }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (isDemoRuntime()) return demoProvisioningPreview(request);

  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("Platform operator authorization is required.", 403);

  let payload: JsonRecord | null;
  try {
    payload = asRecord(await request.json());
  } catch {
    return jsonError("A valid JSON body is required.");
  }
  if (!payload) return jsonError("A JSON object is required.");

  const allowedKeys = new Set(["name", "slug", "propertyName", "primaryColor", "accentColor", "idempotencyKey"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return jsonError("The provisioning request contains an unsupported field.");
  }

  const rawName = typeof payload.name === "string" ? payload.name : "";
  const name = rawName.trim();
  if (name.length < 2 || name.length > 120 || CONTROL_CHARACTER_PATTERN.test(rawName)) {
    return jsonError("Name must be between 2 and 120 characters and contain no control characters.");
  }

  const slug = typeof payload.slug === "string" ? payload.slug.trim().toLowerCase() : "";
  if (!isValidPropertySlug(slug)) return jsonError("Slug must use lowercase letters, numbers and internal hyphens.");

  const rawPropertyName = payload.propertyName === undefined
    ? name
    : typeof payload.propertyName === "string"
      ? payload.propertyName
      : "";
  const propertyName = rawPropertyName.trim();
  if (
    propertyName.length < 2
    || propertyName.length > 120
    || CONTROL_CHARACTER_PATTERN.test(rawPropertyName)
  ) {
    return jsonError("Property name must be between 2 and 120 characters and contain no control characters.");
  }

  const primaryColor = payload.primaryColor === undefined ? DEFAULT_PRIMARY_COLOR : payload.primaryColor;
  const accentColor = payload.accentColor === undefined ? DEFAULT_ACCENT_COLOR : payload.accentColor;
  if (typeof primaryColor !== "string" || !COLOR_PATTERN.test(primaryColor)) {
    return jsonError("Primary color must be a six-digit hexadecimal color.");
  }
  if (typeof accentColor !== "string" || !COLOR_PATTERN.test(accentColor)) {
    return jsonError("Accent color must be a six-digit hexadecimal color.");
  }

  const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 200 || idempotencyKey.trim().length < 16) {
    return jsonError("Idempotency key must be between 16 and 200 characters.");
  }

  const hostname = derivePlatformHostname(slug);
  if (!hostname) return jsonError("The platform domain is not configured correctly.", 503);

  const admin = getSupabaseAdmin();
  const { data: template, error: templateError } = await admin
    .from("template_versions")
    .select("version")
    .eq("status", "current")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (templateError || !template) return jsonError("No current blank template is available.", 503);

  const idempotencyKeyHash = await sha256Hex(idempotencyKey);
  const { data, error } = await admin.rpc("provision_organization_core", {
    p_operator_user_id: operatorUserId,
    p_template_version: template.version,
    p_name: name,
    p_slug: slug,
    p_hostname: hostname,
    p_property_name: propertyName,
    p_primary_color: primaryColor,
    p_accent_color: accentColor,
    p_idempotency_key_hash: idempotencyKeyHash,
  });

  if (error) {
    if (error.code === "22023") return jsonError("The provisioning request is invalid.", 400);
    if (error.code === "P0001") return jsonError("The idempotency key was already used with different provisioning details.", 409);
    if (error.code === "23505") return jsonError("The slug or hostname is already in use.", 409);
    return jsonError("Provisioning could not be started.", 503);
  }

  const result = firstRpcRecord(data);
  if (!result) return jsonError("Provisioning returned an invalid result.", 503);

  const jobId = readString(result, "jobId");
  const organizationId = readString(result, "organizationId");
  const organizationName = readString(result, "organizationName");
  const organizationSlug = readString(result, "organizationSlug");
  const propertyId = readString(result, "propertyId");
  const persistedPropertyName = readString(result, "propertyName");
  const persistedHostname = readString(result, "hostname");
  const persistedTemplateVersion = readString(result, "templateVersion");
  const state = readString(result, "state");
  const idempotentReplay = result.idempotentReplay;
  if (
    !jobId
    || !organizationId
    || !organizationName
    || !organizationSlug
    || !propertyId
    || !persistedPropertyName
    || !persistedHostname
    || !persistedTemplateVersion
    || !state
    || !PROVISIONING_STATES.has(state)
    || typeof idempotentReplay !== "boolean"
  ) {
    return jsonError("Provisioning returned an invalid result.", 503);
  }

  return Response.json({
    persisted: true,
    job: {
      id: jobId,
      state,
      templateVersion: persistedTemplateVersion,
      organization: {
        id: organizationId,
        name: organizationName,
        slug: organizationSlug,
      },
      property: {
        id: propertyId,
        name: persistedPropertyName,
      },
      hostname: persistedHostname,
      idempotentReplay,
    },
  }, { status: idempotentReplay ? 200 : 201, headers: NO_STORE_HEADERS });
}

export async function DELETE(request: Request) {
  if (isDemoRuntime()) return jsonError("Draft deletion is unavailable in the fictional demo.", 404);

  const operatorUserId = await requireOperatorActor(request);
  if (!operatorUserId) return jsonError("An active platform operator session is required.", 401);

  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 1024) {
    return jsonError("The deletion request is too large.", 413);
  }

  let payload: JsonRecord | null;
  try {
    const body = await request.text();
    if (body.length > 1024) return jsonError("The deletion request is too large.", 413);
    payload = asRecord(JSON.parse(body));
  } catch {
    return jsonError("Organization, confirmation slug, and operator password are required.");
  }

  if (
    !payload
    || Object.keys(payload).length !== 3
    || !Object.hasOwn(payload, "organizationId")
    || !Object.hasOwn(payload, "confirmationSlug")
    || !Object.hasOwn(payload, "operatorPassword")
  ) {
    return jsonError("Organization, confirmation slug, and operator password are required.");
  }

  const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
  const confirmationSlug = typeof payload.confirmationSlug === "string"
    ? payload.confirmationSlug.trim().toLowerCase()
    : "";
  const operatorPassword = typeof payload.operatorPassword === "string" ? payload.operatorPassword : "";
  if (!isUuid(organizationId) || !isValidPropertySlug(confirmationSlug)) {
    return jsonError("A valid draft organization and exact confirmation slug are required.");
  }
  if (operatorPassword.length < 8 || operatorPassword.length > 128) {
    return jsonError("Your operator password is incorrect. Nothing was deleted.", 401);
  }

  const supabase = await getSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== operatorUserId || !user.phone) {
    return jsonError("An active platform operator session is required.", 401);
  }

  let limit;
  try {
    limit = await consumeAuthenticationLimits(request, requestHostname(request), user.phone);
  } catch {
    return jsonError("Deletion protection is temporarily unavailable. Nothing was deleted.", 503);
  }
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many password attempts. Wait before trying again; nothing was deleted." },
      { status: 429, headers: { ...NO_STORE_HEADERS, "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  if (!await verifyOperatorPassword(operatorUserId, operatorPassword)) {
    return jsonError("Your operator password is incorrect. Nothing was deleted.", 401);
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("delete_empty_draft_organization", {
    p_operator_user_id: operatorUserId,
    p_organization_id: organizationId,
    p_confirmation_slug: confirmationSlug,
  });
  if (error) {
    if (error.code === "22023") return jsonError("The confirmation slug does not match. Nothing was deleted.");
    if (error.code === "P0001") {
      return jsonError("This PG is no longer an empty draft and cannot be permanently deleted.", 409);
    }
    if (error.code === "42501") return jsonError("Platform operator authorization is required.", 403);
    return jsonError("The draft PG could not be deleted. Nothing was partially removed.", 503);
  }

  const result = firstRpcRecord(data);
  if (
    !result
    || result.deleted !== true
    || readString(result, "organizationId") !== organizationId
    || readString(result, "slug") !== confirmationSlug
  ) {
    return jsonError("Draft deletion returned an invalid result. Refresh the registry before continuing.", 503);
  }

  return Response.json({
    deleted: true,
    organizationId,
    slug: confirmationSlug,
  }, { headers: NO_STORE_HEADERS });
}

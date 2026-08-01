import { createHash, randomBytes } from "node:crypto";
import { requireOperator } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/client";

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `+${digits.slice(0, 2)} ••••••${digits.slice(-4)}` : "Phone unavailable";
}

export async function GET(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getSupabaseAdmin();
  const [organizationResult, residentResult, membershipResult, contactResult] = await Promise.all([
    admin.from("organizations").select("id,name,state")
      .in("state", ["draft", "core_ready", "integrations_pending", "live"]).order("name").limit(1_000),
    admin.from("tenant_profiles").select("id,organization_id,full_name,phone,state")
      .in("state", ["active", "notice"]).order("full_name").limit(5_000),
    admin.from("memberships").select("id,organization_id,display_name,phone,role,state")
      .in("role", ["owner", "accountant"]).eq("state", "active").order("display_name").limit(2_000),
    admin.from("whatsapp_contacts")
      .select("id,organization_id,tenant_id,membership_id,role,language_code,consent_state,reminders_enabled,weekly_report_enabled,activated_at")
      .eq("routing_active", true).limit(7_000),
  ]);
  const queryError = [organizationResult, residentResult, membershipResult, contactResult]
    .find((result) => result.error)?.error;
  if (queryError) {
    return Response.json({ error: "WhatsApp activation directory could not be loaded." }, { status: 409 });
  }

  const contacts = contactResult.data ?? [];
  const contactBySubject = new Map<string, (typeof contacts)[number]>();
  for (const contact of contacts) {
    const subjectId = contact.tenant_id ?? contact.membership_id;
    if (subjectId) contactBySubject.set(`${contact.organization_id}:${subjectId}`, contact);
  }
  const subjects = [
    ...(membershipResult.data ?? []).map((membership) => {
      const whatsapp = contactBySubject.get(`${membership.organization_id}:${membership.id}`) ?? null;
      return {
        id: membership.id,
        organizationId: membership.organization_id,
        subjectType: "owner" as const,
        role: membership.role,
        name: membership.display_name,
        maskedPhone: maskPhone(membership.phone),
        state: membership.state,
        whatsapp,
      };
    }),
    ...(residentResult.data ?? []).map((resident) => {
      const whatsapp = contactBySubject.get(`${resident.organization_id}:${resident.id}`) ?? null;
      return {
        id: resident.id,
        organizationId: resident.organization_id,
        subjectType: "resident" as const,
        role: "resident",
        name: resident.full_name,
        maskedPhone: maskPhone(resident.phone),
        state: resident.state,
        whatsapp,
      };
    }),
  ];
  return Response.json({
    organizations: organizationResult.data ?? [],
    subjects,
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!await requireOperator(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    organizationId?: string;
    subjectId?: string;
    subjectType?: "resident" | "owner";
    languageCode?: "en" | "hi";
  } | null;
  if (
    !body || !isUuid(body.organizationId ?? "") || !isUuid(body.subjectId ?? "")
    || !["resident", "owner"].includes(body.subjectType ?? "")
    || !["en", "hi"].includes(body.languageCode ?? "")
  ) return Response.json({ error: "Activation details are invalid." }, { status: 400 });

  const admin = getSupabaseAdmin();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const publicNumber = (process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (!phoneNumberId || !publicNumber) return Response.json({ error: "Platform WhatsApp is not configured." }, { status: 409 });
  const policyVersion = process.env.WHATSAPP_POLICY_VERSION?.trim() || "2026-07-01";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(policyVersion)) {
    return Response.json({ error: "WhatsApp policy version is invalid." }, { status: 409 });
  }
  const { data: connection } = await admin.from("whatsapp_connections")
    .select("id").eq("phone_number_id", phoneNumberId).in("state", ["test", "live"]).maybeSingle();
  if (!connection) return Response.json({ error: "Platform WhatsApp connection is not ready." }, { status: 409 });

  let contactInput: Record<string, unknown>;
  let subjectColumn: "tenant_id" | "membership_id";
  if (body.subjectType === "resident") {
    subjectColumn = "tenant_id";
    const { data: resident } = await admin.from("tenant_profiles")
      .select("id,full_name,phone").eq("organization_id", body.organizationId)
      .eq("id", body.subjectId).maybeSingle();
    if (!resident) return Response.json({ error: "Resident not found." }, { status: 404 });
    contactInput = {
      organization_id: body.organizationId,
      connection_id: connection.id,
      tenant_id: resident.id,
      membership_id: null,
      role: "resident",
      phone_e164: `+${normalizeWhatsAppPhone(resident.phone)}`,
      display_name: resident.full_name,
      language_code: body.languageCode,
    };
  } else {
    subjectColumn = "membership_id";
    const { data: membership } = await admin.from("memberships")
      .select("id,display_name,phone,role,state").eq("organization_id", body.organizationId)
      .eq("id", body.subjectId).in("role", ["owner", "accountant"]).eq("state", "active").maybeSingle();
    if (!membership) return Response.json({ error: "Active owner/accountant not found." }, { status: 404 });
    contactInput = {
      organization_id: body.organizationId,
      connection_id: connection.id,
      tenant_id: null,
      membership_id: membership.id,
      role: membership.role,
      phone_e164: `+${normalizeWhatsAppPhone(membership.phone)}`,
      display_name: membership.display_name,
      language_code: body.languageCode,
    };
  }
  const { data: existingContacts, error: existingContactError } = await admin
    .from("whatsapp_contacts")
    .select("id,phone_e164")
    .eq("organization_id", body.organizationId)
    .eq(subjectColumn, body.subjectId)
    .eq("routing_active", true)
    .order("created_at", { ascending: false })
    .limit(2);
  if (existingContactError || (existingContacts?.length ?? 0) > 1) {
    return Response.json({ error: "Contact routing needs operator review before activation." }, { status: 409 });
  }
  const existingContact = existingContacts?.[0] ?? null;
  const phoneChanged = Boolean(
    existingContact
    && existingContact.phone_e164 !== contactInput.phone_e164,
  );
  const preparedContact = phoneChanged
    ? {
        ...contactInput,
        consent_state: "unknown",
        reminders_enabled: false,
        weekly_report_enabled: false,
        activated_at: null,
      }
    : contactInput;
  const contactResult = existingContact
    ? await admin.from("whatsapp_contacts").update(preparedContact)
        .eq("id", existingContact.id).eq("organization_id", body.organizationId)
        .select("id").single()
    : await admin.from("whatsapp_contacts").insert(preparedContact).select("id").single();
  const { data: contact, error: contactError } = contactResult;
  if (contactError) return Response.json({ error: "Contact could not be prepared." }, { status: 409 });

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await admin.from("whatsapp_activation_tokens").delete()
    .eq("organization_id", body.organizationId).eq("contact_id", contact.id).is("used_at", null);
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error: tokenError } = await admin.from("whatsapp_activation_tokens").insert({
    organization_id: body.organizationId,
    contact_id: contact.id,
    token_hash: tokenHash,
    policy_version: policyVersion,
    expires_at: expiresAt,
  });
  if (tokenError) return Response.json({ error: "Activation link could not be created." }, { status: 409 });
  const text = `START ${token}`;
  return Response.json({
    contactId: contact.id,
    activationUrl: `https://wa.me/${publicNumber}?text=${encodeURIComponent(text)}`,
    qrValue: `https://wa.me/${publicNumber}?text=${encodeURIComponent(text)}`,
    expiresAt,
  }, { status: 201, headers: { "cache-control": "no-store" } });
}

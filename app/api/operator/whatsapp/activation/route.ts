import { createHash, randomBytes } from "node:crypto";
import { requireOperator } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/client";

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
  const { data: connection } = await admin.from("whatsapp_connections")
    .select("id").eq("phone_number_id", phoneNumberId).in("state", ["test", "live"]).maybeSingle();
  if (!connection) return Response.json({ error: "Platform WhatsApp connection is not ready." }, { status: 409 });

  let contactInput: Record<string, unknown>;
  if (body.subjectType === "resident") {
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
  const { data: contact, error: contactError } = await admin.from("whatsapp_contacts")
    .upsert(contactInput, { onConflict: "organization_id,phone_e164,role" })
    .select("id").single();
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
    policy_version: "2026-07",
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

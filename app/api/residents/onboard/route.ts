import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { normalizeIndianPhone } from "@/lib/owner-invitations";
import { validateResidentOnboardingInput } from "@/lib/resident-onboarding-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 4096;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

async function readLimitedJson(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) return null;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return null;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function money(value: unknown) {
  return Number.isInteger(value) ? Number(value) : null;
}

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return jsonError("That resident phone number is already in this PG.", 409);
  if (error.code === "42501") return jsonError("Only the active property owner can onboard a resident.", 403);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The resident details are invalid.");
  return jsonError("The resident could not be onboarded. Please try again.", 500);
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin resident changes are not allowed.", 403);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const actor = await requireActor(request, ["owner"]);
  if (!actor || !actor.propertyId) return jsonError("Active property-owner access is required.", 401);
  const body = await readLimitedJson(request);
  if (!body || Object.keys(body).length !== 12) return jsonError("Complete all required resident details.");

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? normalizeIndianPhone(body.phone) : "";
  const alternatePhone = typeof body.alternatePhone === "string" && body.alternatePhone.trim()
    ? normalizeIndianPhone(body.alternatePhone)
    : "";
  const emergencyName = typeof body.emergencyName === "string" ? body.emergencyName.trim() : "";
  const emergencyPhone = typeof body.emergencyPhone === "string" ? normalizeIndianPhone(body.emergencyPhone) : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const bedId = typeof body.bedId === "string" ? body.bedId : "";
  const moveInDate = typeof body.moveInDate === "string" ? body.moveInDate : "";
  const monthlyRent = money(body.monthlyRent);
  const depositPromised = money(body.depositPromised);
  const openingDue = money(body.openingDue);

  const fieldErrors = validateResidentOnboardingInput({
    fullName: body.fullName,
    phone: body.phone,
    alternatePhone: body.alternatePhone,
    emergencyName: body.emergencyName,
    emergencyPhone: body.emergencyPhone,
    address: body.address,
    bedId: body.bedId,
    moveInDate: body.moveInDate,
    monthlyRent: body.monthlyRent,
    depositPromised: body.depositPromised,
    openingDue: body.openingDue,
    confirmAssignment: body.confirmAssignment,
  });
  if (Object.keys(fieldErrors).length > 0) {
    return Response.json({ error: "Please correct the highlighted fields.", fieldErrors }, {
      status: 400,
      headers: { "cache-control": "no-store" },
    });
  }

  if (monthlyRent === null || depositPromised === null || openingDue === null) {
    return jsonError("The financial details are invalid.");
  }

  const { data, error } = await getSupabaseAdmin().rpc("onboard_resident_to_bed", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_bed_id: bedId,
    p_full_name: fullName,
    p_phone: phone,
    p_alternate_phone: alternatePhone,
    p_emergency_name: emergencyName,
    p_emergency_phone: emergencyPhone,
    p_address: address,
    p_move_in_date: moveInDate,
    p_monthly_rent: monthlyRent,
    p_deposit_promised: depositPromised,
    p_opening_due: openingDue,
  });
  if (error) return rpcError(error);

  return Response.json({ onboarded: true, resident: data }, {
    status: 201,
    headers: { "cache-control": "no-store" },
  });
}

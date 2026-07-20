import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const MAX_BODY_BYTES = 2048;
const ROOM_CODE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,19}$/;
const ROOM_TYPES = new Set(["single", "double", "triple", "shared"]);
const ROOM_STATES = new Set(["active", "maintenance"]);

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

function rpcError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return jsonError("That floor name or room code already exists.", 409);
  if (error.code === "42501") return jsonError("Only the active property owner can change this setup.", 403);
  if (error.code === "22023" || error.code === "P0001") return jsonError(error.message ?? "The setup details are invalid.");
  return jsonError("The property setup could not be saved. Please try again.", 500);
}

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin property changes are not allowed.", 403);
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return jsonError("A JSON request is required.", 415);

  const actor = await requireActor(request, ["owner"]);
  if (!actor || !actor.propertyId) return jsonError("Active property-owner access is required.", 401);
  const body = await readLimitedJson(request);
  if (!body || typeof body.action !== "string") return jsonError("Valid property setup details are required.");

  const admin = getSupabaseAdmin();
  if (body.action === "create_floor") {
    if (Object.keys(body).length !== 3 || typeof body.name !== "string" || !Number.isInteger(body.sortOrder)) {
      return jsonError("Floor name and display order are required.");
    }
    const name = body.name.trim();
    const sortOrder = Number(body.sortOrder);
    if (name.length < 1 || name.length > 60 || sortOrder < 0 || sortOrder > 999) {
      return jsonError("Use a floor name up to 60 characters and an order from 0 to 999.");
    }
    const { data, error } = await admin.rpc("create_property_floor", {
      p_actor_user_id: actor.id,
      p_organization_id: actor.organizationId,
      p_property_id: actor.propertyId,
      p_name: name,
      p_sort_order: sortOrder,
    });
    if (error) return rpcError(error);
    return Response.json({ created: true, floor: data }, { status: 201, headers: { "cache-control": "no-store" } });
  }

  if (body.action === "create_room") {
    if (
      Object.keys(body).length !== 8
      || typeof body.floorId !== "string"
      || typeof body.code !== "string"
      || typeof body.roomType !== "string"
      || !Number.isInteger(body.capacity)
      || !Number.isInteger(body.defaultRent)
      || typeof body.state !== "string"
      || body.confirmBedCreation !== true
    ) return jsonError("Complete all room details before creating its beds.");

    const code = body.code.trim();
    const capacity = Number(body.capacity);
    const defaultRent = Number(body.defaultRent);
    if (
      !isUuid(body.floorId)
      || !ROOM_CODE.test(code)
      || !ROOM_TYPES.has(body.roomType)
      || capacity < 1
      || capacity > 20
      || defaultRent < 0
      || defaultRent > 10_000_000
      || !ROOM_STATES.has(body.state)
    ) return jsonError("One or more room details are invalid.");

    const { data, error } = await admin.rpc("create_room_with_beds", {
      p_actor_user_id: actor.id,
      p_organization_id: actor.organizationId,
      p_property_id: actor.propertyId,
      p_floor_id: body.floorId,
      p_code: code,
      p_room_type: body.roomType,
      p_capacity: capacity,
      p_default_rent: defaultRent,
      p_state: body.state,
    });
    if (error) return rpcError(error);
    return Response.json({ created: true, room: data }, { status: 201, headers: { "cache-control": "no-store" } });
  }

  return jsonError("The property setup action is not supported.");
}

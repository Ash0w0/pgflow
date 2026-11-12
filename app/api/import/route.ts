import { MAX_IMPORT_BYTES, parseResidentsCsv, parseRoomsCsv } from "@/lib/bulk-import";
import { isTrustedMutationRequest, jsonError, requireActor } from "@/lib/http";
import { isDemoRuntime } from "@/lib/runtime";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const NO_STORE = { "cache-control": "no-store" };

/**
 * POST { roomsCsv, residentsCsv, commit }
 * commit=false checks everything (including a rolled-back database run) and saves nothing.
 * commit=true imports all rows in one transaction, or nothing at all.
 */
export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Cross-origin imports are not allowed.", 403);
  if (isDemoRuntime()) return jsonError("Imports are unavailable in the fictional demo.", 404);
  const actor = await requireActor(request, ["owner"]);
  if (!actor?.propertyId) return jsonError("Active property-owner access is required.", 401);

  const text = await request.text().catch(() => "");
  if (text.length > MAX_IMPORT_BYTES * 2 + 1024) return jsonError("The files are too large. Split them into smaller imports.", 413);
  let body: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(text);
    body = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.commit !== "boolean") return jsonError("Upload a rooms file, a residents file, or both.");
  const roomsCsv = typeof body.roomsCsv === "string" ? body.roomsCsv : "";
  const residentsCsv = typeof body.residentsCsv === "string" ? body.residentsCsv : "";
  if (!roomsCsv.trim() && !residentsCsv.trim()) return jsonError("Upload a rooms file, a residents file, or both.");
  if (roomsCsv.length > MAX_IMPORT_BYTES || residentsCsv.length > MAX_IMPORT_BYTES) {
    return jsonError("Each file must be smaller than 512 KB.", 413);
  }

  const { rooms, issues: roomIssues } = parseRoomsCsv(roomsCsv);
  const { residents, issues: residentIssues } = parseResidentsCsv(residentsCsv);
  const issues = [...roomIssues, ...residentIssues];
  if (issues.length > 0) {
    return Response.json({ ok: false, stage: "file", issues: issues.slice(0, 200), issueCount: issues.length }, { status: 422, headers: NO_STORE });
  }
  if (rooms.length === 0 && residents.length === 0) return jsonError("The files have no data rows.");

  const { data, error } = await getSupabaseAdmin().rpc("bulk_import_property", {
    p_actor_user_id: actor.id,
    p_organization_id: actor.organizationId,
    p_property_id: actor.propertyId,
    p_rooms: rooms,
    p_residents: residents,
    p_dry_run: !body.commit,
  });
  if (error) {
    if (error.code === "42501") return jsonError("Only the active property owner can import.", 403);
    const known = ["22023", "P0001", "23505", "23514", "22P02", "22007", "22008"].includes(error.code ?? "");
    if (!known) return jsonError("The import could not be completed. Nothing was saved.", 503);
    const match = /^(Rooms|Residents) row (\d+): ([\s\S]*)$/.exec(error.message ?? "");
    const issue = match
      ? { file: match[1].toLowerCase() as "rooms" | "residents", row: Number(match[2]), message: error.code === "23505" ? `${match[3]} (already exists in this PG)` : match[3] }
      : { file: "residents" as const, row: 0, message: error.message ?? "The import was refused." };
    return Response.json({ ok: false, stage: "database", issues: [issue], issueCount: 1, nothingSaved: true }, { status: 422, headers: NO_STORE });
  }

  return Response.json({ ok: true, committed: body.commit, summary: data }, { status: body.commit ? 201 : 200, headers: NO_STORE });
}

import { requireOperator } from "@/lib/http";
import { isUuid } from "@/lib/owner-invitations";
import {
  enqueueOperatorWeeklyReport,
  loadOperatorWeeklyReport,
} from "@/lib/whatsapp/operator-weekly-report";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONFIRMATION = "queue_weekly_report";

function isValidWeekStart(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  if (parsed.getUTCDay() !== 1) return false;
  const now = new Date();
  const earliest = new Date(now.getTime() - 366 * 86_400_000);
  return parsed <= now && parsed >= earliest;
}

function invalidDetails(organizationId: string, ownerMembershipId: string, weekStart: string) {
  return !isUuid(organizationId) || !isUuid(ownerMembershipId) || !isValidWeekStart(weekStart);
}

export async function GET(request: Request) {
  if (!await requireOperator(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId") ?? "";
  const ownerMembershipId = url.searchParams.get("ownerMembershipId") ?? "";
  const weekStart = url.searchParams.get("weekStart") ?? "";
  if (invalidDetails(organizationId, ownerMembershipId, weekStart)) {
    return Response.json({ error: "Weekly report details are invalid." }, { status: 400 });
  }

  try {
    const { preview } = await loadOperatorWeeklyReport(organizationId, ownerMembershipId, weekStart);
    return Response.json({ preview }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    return Response.json({
      error: caught instanceof Error ? caught.message : "Weekly report preview could not be loaded.",
    }, { status: 409 });
  }
}

export async function POST(request: Request) {
  if (!await requireOperator(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 2_048) {
    return Response.json({ error: "Weekly report request is too large." }, { status: 413 });
  }
  const body = await request.json().catch(() => null) as {
    organizationId?: string;
    ownerMembershipId?: string;
    weekStart?: string;
    confirmation?: string;
  } | null;
  const organizationId = body?.organizationId ?? "";
  const ownerMembershipId = body?.ownerMembershipId ?? "";
  const weekStart = body?.weekStart ?? "";
  if (
    !body
    || invalidDetails(organizationId, ownerMembershipId, weekStart)
    || body.confirmation !== CONFIRMATION
  ) {
    return Response.json({ error: "Explicit queue confirmation is required." }, { status: 400 });
  }

  try {
    const { preview, queueContext } = await loadOperatorWeeklyReport(
      organizationId,
      ownerMembershipId,
      weekStart,
    );
    if (!preview.ready || !queueContext) {
      return Response.json({
        error: preview.blockers[0] ?? "Weekly report delivery is not ready.",
        preview,
      }, { status: 409 });
    }
    const result = await enqueueOperatorWeeklyReport(queueContext);
    return Response.json(result, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (caught) {
    return Response.json({
      error: caught instanceof Error ? caught.message : "Weekly report could not be queued.",
    }, { status: 409 });
  }
}

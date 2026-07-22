import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "accountant"]);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { ticketId } = await params;

    const body = (await request.json()) as Record<string, any>;
    const { status } = body;

    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Valid status (open, in_progress, resolved, closed) is required." },
        { status: 400 }
      );
    }

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      return NextResponse.json({
        ok: true,
        ticketId,
        status,
        updatedAt: new Date().toISOString(),
        message: "Ticket status updated in demo mode.",
      });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("update_maintenance_ticket_status", {
      p_actor_id: actor.id,
      p_organization_id: actor.organizationId,
      p_ticket_id: ticketId,
      p_status: status,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to update ticket status." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

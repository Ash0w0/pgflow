import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ residentId: string }> }
) {
  try {
    const actor = await requireActor(request, ["owner", "manager"]);
    const { residentId } = await params;

    const body = (await request.json()) as Record<string, any>;
    const {
      exitDate,
      utilityDeductions = 0,
      damageDeductions = 0,
      unpaidRentDeductions = 0,
      remarks = "",
    } = body;

    if (!exitDate || typeof exitDate !== "string") {
      return NextResponse.json(
        { error: "Valid exit date is required." },
        { status: 400 }
      );
    }

    if (
      typeof utilityDeductions !== "number" ||
      utilityDeductions < 0 ||
      typeof damageDeductions !== "number" ||
      damageDeductions < 0 ||
      typeof unpaidRentDeductions !== "number" ||
      unpaidRentDeductions < 0
    ) {
      return NextResponse.json(
        { error: "Deduction amounts must be non-negative numbers." },
        { status: 400 }
      );
    }

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      const totalDeductions = utilityDeductions + damageDeductions + unpaidRentDeductions;
      return NextResponse.json({
        ok: true,
        moveoutId: `demo-moveout-${Date.now()}`,
        organizationId: actor.organizationId,
        residentId,
        exitDate,
        utilityDeductions,
        damageDeductions,
        unpaidRentDeductions,
        netRefundAmount: Math.max(0, 10000 - totalDeductions),
        state: "completed",
        message: "Resident move-out settlement completed in demo mode.",
      });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("process_resident_moveout", {
      p_actor_id: actor.id,
      p_organization_id: actor.organizationId,
      p_resident_id: residentId,
      p_exit_date: exitDate,
      p_utility_deductions: utilityDeductions,
      p_damage_deductions: damageDeductions,
      p_unpaid_rent_deductions: unpaidRentDeductions,
      p_remarks: remarks || null,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to process resident move-out." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

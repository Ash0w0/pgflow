import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeDbMessage } from "@/lib/safe-db-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ residentId: string }> }
) {
  try {
    const actor = await requireActor(request, ["owner", "manager"]);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { residentId } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await request.json()) as Record<string, any>;
    const exitDate = typeof body.exitDate === "string" ? body.exitDate : "";
    const utilityDeductions = typeof body.utilityDeductions === "number" ? body.utilityDeductions : 0;
    const damageDeductions = typeof body.damageDeductions === "number" ? body.damageDeductions : 0;
    const unpaidRentDeductions = typeof body.unpaidRentDeductions === "number" ? body.unpaidRentDeductions : 0;
    const remarks = typeof body.remarks === "string" ? body.remarks : "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(exitDate) || Number.isNaN(Date.parse(exitDate))) {
      return NextResponse.json(
        { error: "Valid exit date is required." },
        { status: 400 }
      );
    }
    // A move-out settles the stay and frees the bed immediately, so it can only
    // be recorded on or after the day the resident actually leaves (India time).
    const todayInIndia = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (exitDate > todayInIndia) {
      return NextResponse.json(
        { error: "The exit date cannot be in the future. Record the move-out on the day the resident leaves." },
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
        { error: safeDbMessage(error, "The move-out could not be saved. Please try again.") },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    console.error(err);
    const errorMsg = "Something went wrong. Please try again.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

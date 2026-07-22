import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "staff"]);
    const body = await request.json();

    const {
      roomNumber,
      category,
      title,
      description = "",
      priority = "medium",
      residentId = null,
    } = body;

    if (!roomNumber || !category || !title) {
      return NextResponse.json(
        { error: "Room number, category, and title are required." },
        { status: 400 }
      );
    }

    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      return NextResponse.json({
        ok: true,
        ticket: {
          id: `demo-ticket-${Date.now()}`,
          organizationId: actor.organizationId,
          residentId,
          roomNumber,
          category,
          title,
          description,
          status: "open",
          priority,
          createdAt: new Date().toISOString(),
        },
        message: "Maintenance complaint logged in demo mode.",
      });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("create_maintenance_ticket", {
      p_actor_id: actor.id,
      p_organization_id: actor.organizationId,
      p_resident_id: residentId,
      p_room_number: roomNumber,
      p_category: category,
      p_title: title,
      p_description: description,
      p_priority: priority,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to create maintenance ticket." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "staff"]);
    const isDemo = process.env.PGFLOW_RUNTIME === "demo";

    if (isDemo) {
      return NextResponse.json({
        ok: true,
        tickets: [
          {
            id: "CMP-1042",
            roomNumber: "A-204",
            category: "wifi",
            title: "Wi-Fi drops repeatedly in evening",
            description: "Frequent signal drops after 8 PM.",
            status: "in_progress",
            priority: "high",
            createdAt: new Date().toISOString(),
          },
          {
            id: "CMP-1043",
            roomNumber: "B-105",
            category: "plumbing",
            title: "Bathroom tap leakage",
            description: "Constant slow drip from sink tap.",
            status: "open",
            priority: "medium",
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("maintenance_tickets")
      .select("*")
      .eq("organization_id", actor.organizationId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch maintenance tickets." },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, tickets: data });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireActor } from "@/lib/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeDbMessage } from "@/lib/safe-db-error";

const TICKET_CATEGORIES = new Set(["wifi", "plumbing", "electrical", "cleaning", "food", "other"]);
const TICKET_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "accountant"]);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await request.json()) as Record<string, any>;

    const roomNumber = typeof body.roomNumber === "string" ? body.roomNumber : "";
    const category = typeof body.category === "string" ? body.category : "";
    const title = typeof body.title === "string" ? body.title : "";
    const description = typeof body.description === "string" ? body.description : "";
    const priority = typeof body.priority === "string" ? body.priority : "medium";
    const residentId = typeof body.residentId === "string" ? body.residentId : null;

    if (!roomNumber || !category || !title) {
      return NextResponse.json(
        { error: "Room number, category, and title are required." },
        { status: 400 }
      );
    }

    if (!TICKET_CATEGORIES.has(category) || !TICKET_PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Choose a valid category and priority." }, { status: 400 });
    }
    if (title.length > 160 || description.length > 2000 || roomNumber.length > 40) {
      return NextResponse.json({ error: "Keep the title under 160 characters and the details under 2,000." }, { status: 400 });
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
        { error: safeDbMessage(error, "The ticket could not be created. Please try again.") },
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

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request, ["owner", "manager", "accountant"]);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
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
        { error: safeDbMessage(error, "Tickets could not be loaded. Please try again.") },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, tickets: data });
  } catch (err: unknown) {
    console.error(err);
    const errorMsg = "Something went wrong. Please try again.";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

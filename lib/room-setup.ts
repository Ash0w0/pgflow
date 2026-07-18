import "server-only";

import { getSupabaseAdmin } from "./supabase/admin";
import type { RoomSetupData, RoomSetupFloor } from "./room-setup-types";

export async function getRoomSetupData(organizationId: string, propertyId: string): Promise<RoomSetupData> {
  const admin = getSupabaseAdmin();
  const [floorsResult, roomsResult, bedsResult] = await Promise.all([
    admin
      .from("floors")
      .select("id,name,sort_order,state")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("sort_order")
      .order("name"),
    admin
      .from("rooms")
      .select("id,floor_id,code,room_type,capacity,default_rent,state")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("code"),
    admin
      .from("beds")
      .select("id,room_id,label,rent_override,state")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .order("label"),
  ]);

  if (floorsResult.error) throw new Error(`Floor setup could not be loaded: ${floorsResult.error.message}`);
  if (roomsResult.error) throw new Error(`Room setup could not be loaded: ${roomsResult.error.message}`);
  if (bedsResult.error) throw new Error(`Bed setup could not be loaded: ${bedsResult.error.message}`);

  const bedsByRoom = new Map<string, RoomSetupFloor["rooms"][number]["beds"]>();
  for (const bed of bedsResult.data ?? []) {
    const roomBeds = bedsByRoom.get(bed.room_id) ?? [];
    roomBeds.push({
      id: bed.id,
      label: bed.label,
      rentOverride: bed.rent_override === null ? null : Number(bed.rent_override),
      state: bed.state,
    });
    bedsByRoom.set(bed.room_id, roomBeds);
  }

  const roomsByFloor = new Map<string, RoomSetupFloor["rooms"]>();
  for (const room of roomsResult.data ?? []) {
    if (!room.floor_id) continue;
    const floorRooms = roomsByFloor.get(room.floor_id) ?? [];
    floorRooms.push({
      id: room.id,
      code: room.code,
      roomType: room.room_type,
      capacity: room.capacity,
      defaultRent: Number(room.default_rent),
      state: room.state,
      beds: bedsByRoom.get(room.id) ?? [],
    });
    roomsByFloor.set(room.floor_id, floorRooms);
  }

  const floors: RoomSetupFloor[] = (floorsResult.data ?? []).map((floor) => ({
    id: floor.id,
    name: floor.name,
    sortOrder: floor.sort_order,
    state: floor.state,
    rooms: roomsByFloor.get(floor.id) ?? [],
  }));
  const allBeds = floors.flatMap((floor) => floor.rooms.flatMap((room) => room.beds));

  return {
    floors,
    totals: {
      floors: floors.length,
      rooms: floors.reduce((total, floor) => total + floor.rooms.length, 0),
      beds: allBeds.length,
      vacantBeds: allBeds.filter((bed) => bed.state === "vacant").length,
      maintenanceBeds: allBeds.filter((bed) => bed.state === "maintenance").length,
    },
  };
}

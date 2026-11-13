import "server-only";

import { getSupabaseAdmin } from "./supabase/admin";
import { selectAll } from "./supabase/select-all";
import type { AvailableResidentBed, ResidentRegisterRow, ResidentSetupData } from "./resident-setup-types";

export async function getResidentSetupData(organizationId: string, propertyId: string): Promise<ResidentSetupData> {
  const admin = getSupabaseAdmin();
  const [organizationResult, floorsResult, roomsResult, bedsResult, tenantsResult, occupanciesResult, invoicesResult] = await Promise.all([
    admin.from("organizations").select("resident_limit").eq("id", organizationId).single(),
    selectAll((from, to) => admin.from("floors").select("id,name,state").eq("organization_id", organizationId).eq("property_id", propertyId).order("id").range(from, to)),
    selectAll((from, to) => admin.from("rooms").select("id,floor_id,code,default_rent,state").eq("organization_id", organizationId).eq("property_id", propertyId).order("id").range(from, to)),
    selectAll((from, to) => admin.from("beds").select("id,room_id,label,state").eq("organization_id", organizationId).eq("property_id", propertyId).order("id").range(from, to)),
    selectAll((from, to) => admin.from("tenant_profiles").select("id,full_name,phone,alternate_phone,emergency_name,emergency_phone,address,state,membership_id").eq("organization_id", organizationId).eq("property_id", propertyId).order("id").range(from, to)),
    selectAll((from, to) => admin.from("occupancies").select("id,tenant_id,bed_id,move_in_date,monthly_rent,deposit_promised,state").eq("organization_id", organizationId).eq("property_id", propertyId).in("state", ["active", "notice"]).order("id").range(from, to)),
    selectAll((from, to) => admin.from("invoices").select("tenant_id,total_amount,paid_amount,state").eq("organization_id", organizationId).eq("property_id", propertyId).in("state", ["issued", "partially_paid", "overdue"]).order("id").range(from, to)),
  ]);

  for (const [label, result] of [
    ["organization", organizationResult],
    ["floors", floorsResult], ["rooms", roomsResult], ["beds", bedsResult],
    ["residents", tenantsResult], ["occupancies", occupanciesResult], ["invoices", invoicesResult],
  ] as const) {
    if (result.error) throw new Error(`Resident ${label} could not be loaded: ${result.error.message}`);
  }

  const floors = new Map((floorsResult.data ?? []).map((floor) => [floor.id, floor]));
  const rooms = new Map((roomsResult.data ?? []).map((room) => [room.id, room]));
  const beds = new Map((bedsResult.data ?? []).map((bed) => [bed.id, bed]));
  const tenants = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant]));
  const accessResult = await selectAll((from, to) => admin.from("memberships").select("id,state").eq("organization_id", organizationId).eq("property_id", propertyId).eq("role", "tenant").order("id").range(from, to));
  if (accessResult.error) throw new Error(`Resident app access could not be loaded: ${accessResult.error.message}`);
  const accessByMembership = new Map((accessResult.data ?? []).map((membership) => [membership.id, membership.state === "active" ? "active" as const : "disabled" as const]));
  const outstandingByTenant = new Map<string, number>();
  for (const invoice of invoicesResult.data ?? []) {
    outstandingByTenant.set(
      invoice.tenant_id,
      (outstandingByTenant.get(invoice.tenant_id) ?? 0) + Number(invoice.total_amount) - Number(invoice.paid_amount),
    );
  }

  const availableBeds: AvailableResidentBed[] = [];
  for (const bed of bedsResult.data ?? []) {
    if (bed.state !== "vacant") continue;
    const room = rooms.get(bed.room_id);
    const floor = room?.floor_id ? floors.get(room.floor_id) : null;
    if (!room || room.state !== "active" || !floor || floor.state !== "active") continue;
    availableBeds.push({
      id: bed.id,
      floorName: floor.name,
      roomCode: room.code,
      bedLabel: bed.label,
      defaultRent: Number(room.default_rent),
    });
  }
  availableBeds.sort((left, right) => `${left.floorName}\u0000${left.roomCode}\u0000${left.bedLabel}`.localeCompare(`${right.floorName}\u0000${right.roomCode}\u0000${right.bedLabel}`));

  const residents: ResidentRegisterRow[] = [];
  for (const occupancy of occupanciesResult.data ?? []) {
    const tenant = tenants.get(occupancy.tenant_id);
    const bed = beds.get(occupancy.bed_id);
    const room = bed ? rooms.get(bed.room_id) : null;
    const floor = room?.floor_id ? floors.get(room.floor_id) : null;
    if (!tenant || !bed || !room || !floor) continue;
    residents.push({
      id: tenant.id,
      bedId: occupancy.bed_id,
      fullName: tenant.full_name,
      phone: tenant.phone,
      alternatePhone: tenant.alternate_phone ?? "",
      emergencyName: tenant.emergency_name,
      emergencyPhone: tenant.emergency_phone,
      address: tenant.address,
      floorName: floor.name,
      roomCode: room.code,
      bedLabel: bed.label,
      moveInDate: occupancy.move_in_date,
      monthlyRent: Number(occupancy.monthly_rent),
      depositPromised: Number(occupancy.deposit_promised),
      outstanding: outstandingByTenant.get(tenant.id) ?? 0,
      state: tenant.state,
      appAccess: tenant.membership_id ? accessByMembership.get(tenant.membership_id) ?? "none" : "none",
    });
  }
  residents.sort((left, right) => left.fullName.localeCompare(right.fullName));

  return {
    residentLimit: Number(organizationResult.data?.resident_limit ?? 2),
    availableBeds,
    residents,
    totals: {
      activeResidents: residents.filter((resident) => resident.state === "active").length,
      noticeResidents: residents.filter((resident) => resident.state === "notice").length,
      availableBeds: availableBeds.length,
      totalOutstanding: residents.reduce((total, resident) => total + resident.outstanding, 0),
      depositsPromised: residents.reduce((total, resident) => total + resident.depositPromised, 0),
    },
  };
}

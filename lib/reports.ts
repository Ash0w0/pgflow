import "server-only";

import { getCollectionsData } from "./collections";
import type { ReportsData } from "./reports-types";
import { getRoomSetupData } from "./room-setup";
import { getSupabaseAdmin } from "./supabase/admin";

/**
 * Composes the owner reporting view from the same loaders the Collections and Rooms
 * registers use, so every figure reconciles against those pages.
 */
export async function getReportsData(organizationId: string, propertyId: string): Promise<ReportsData> {
  const admin = getSupabaseAdmin();

  const [collections, rooms, approvedPayments, deposits] = await Promise.all([
    getCollectionsData(organizationId, propertyId),
    getRoomSetupData(organizationId, propertyId),
    // 'approved' is the only payment_state that represents money actually collected.
    admin
      .from("payments")
      .select("method,amount")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("state", "approved")
      .limit(5000),
    admin
      .from("occupancies")
      .select("deposit_promised")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .in("state", ["active", "notice"])
      .limit(1000),
  ]);

  if (approvedPayments.error) {
    throw new Error(`Approved payments could not be loaded: ${approvedPayments.error.message}`);
  }
  if (deposits.error) {
    throw new Error(`Deposit liability could not be loaded: ${deposits.error.message}`);
  }

  const collectedByMethod = (approvedPayments.data ?? []).reduce(
    (totals, payment) => {
      const amount = Number(payment.amount);
      if (payment.method === "cash") totals.cash += amount;
      else totals.upi += amount;
      return totals;
    },
    { upi: 0, cash: 0 },
  );

  const occupiedBeds = rooms.totals.beds - rooms.totals.vacantBeds - rooms.totals.maintenanceBeds;

  return {
    periodLabel: collections.periodLabel,
    collections: {
      invoiceCount: collections.totals.invoiceCount,
      totalBilled: collections.totals.totalBilled,
      totalCollected: collections.totals.totalCollected,
      totalOutstanding: collections.totals.totalOutstanding,
      overdueCount: collections.totals.overdueCount,
      collectedByUpi: collectedByMethod.upi,
      collectedByCash: collectedByMethod.cash,
    },
    occupancy: {
      totalBeds: rooms.totals.beds,
      occupiedBeds,
      vacantBeds: rooms.totals.vacantBeds,
      maintenanceBeds: rooms.totals.maintenanceBeds,
      occupancyRate: rooms.totals.beds > 0 ? occupiedBeds / rooms.totals.beds : 0,
    },
    deposits: {
      heldTotal: (deposits.data ?? []).reduce((sum, row) => sum + Number(row.deposit_promised), 0),
      residentCount: (deposits.data ?? []).length,
    },
  };
}

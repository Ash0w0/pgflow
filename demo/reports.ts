import { billingPeriodLabel, currentIndiaBillingPeriod } from "@/lib/billing-period";
import type { ReportsData } from "@/lib/reports-types";
import { roomSummaries } from "./data";

export function getDemoReportsData(): ReportsData {
  const totalBeds = roomSummaries.reduce((sum, room) => sum + room.total, 0);
  const occupiedBeds = roomSummaries.reduce((sum, room) => sum + room.occupied, 0);
  const maintenanceBeds = roomSummaries.filter((room) => room.state === "maintenance").reduce((sum, room) => sum + room.total, 0);
  const billed = roomSummaries.reduce((sum, room) => sum + room.rent * room.occupied, 0);
  const collected = Math.round(billed * 0.91);

  return {
    periodLabel: billingPeriodLabel(currentIndiaBillingPeriod()),
    collections: {
      invoiceCount: occupiedBeds,
      totalBilled: billed,
      totalCollected: collected,
      totalOutstanding: billed - collected,
      overdueCount: 2,
      collectedByUpi: Math.round(collected * 0.9),
      collectedByCash: collected - Math.round(collected * 0.9),
    },
    occupancy: {
      totalBeds,
      occupiedBeds,
      vacantBeds: totalBeds - occupiedBeds - maintenanceBeds,
      maintenanceBeds,
      occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
    },
    deposits: {
      heldTotal: roomSummaries.reduce((sum, room) => sum + room.rent * room.occupied, 0),
      residentCount: occupiedBeds,
    },
  };
}

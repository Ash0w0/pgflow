import { ReportsWorkspace } from "@/components/reports-workspace";
import { billingPeriodLabel, currentIndiaBillingPeriod } from "@/lib/billing-period";
import { roomSummaries } from "@/lib/demo-data";
import { requireStaffPage } from "@/lib/page-authorization";
import { getReportsData } from "@/lib/reports";
import type { ReportsData } from "@/lib/reports-types";

function demoReportsData(): ReportsData {
  const totalBeds = roomSummaries.reduce((sum, room) => sum + room.total, 0);
  const occupiedBeds = roomSummaries.reduce((sum, room) => sum + room.occupied, 0);
  const maintenanceBeds = roomSummaries
    .filter((room) => room.state === "maintenance")
    .reduce((sum, room) => sum + room.total, 0);
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

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "accountant"]);

  if (authorization.mode === "demo") {
    return <ReportsWorkspace data={demoReportsData()} demoMode />;
  }

  const { organizationId, propertyId } = authorization.actor;
  if (!propertyId) throw new Error("The staff member is not assigned to a property.");

  const data = await getReportsData(organizationId, propertyId);
  return <ReportsWorkspace data={data} demoMode={false} />;
}

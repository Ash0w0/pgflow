export type ReportsData = {
  periodLabel: string;
  collections: {
    invoiceCount: number;
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    overdueCount: number;
    collectedByUpi: number;
    collectedByCash: number;
  };
  occupancy: {
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    maintenanceBeds: number;
    occupancyRate: number;
  };
  deposits: {
    heldTotal: number;
    residentCount: number;
  };
};

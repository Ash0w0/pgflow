import { OperationsWorkspace, type OperationsData } from "@/components/operations-workspace";
import { getMaintenanceTickets } from "@/lib/maintenance-ticket-data";
import { getPendingMoveOutRequests } from "@/lib/move-out-request-data";
import { requireStaffPage } from "@/lib/page-authorization";
import { getResidentSetupData } from "@/lib/resident-setup";

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "manager"]);
  if (authorization.mode === "demo") {
    const { getDemoMaintenanceTickets } = await import("@/demo/maintenance-ticket-data");
    const data: OperationsData = {
      tickets: getDemoMaintenanceTickets(),
      residents: [],
      noticePeriodCount: 1,
      moveOutRequests: [],
    };
    return <OperationsWorkspace data={data} demoMode canManage={false} />;
  }

  const { organizationId, propertyId } = authorization.actor;
  if (!propertyId) throw new Error("The staff member is not assigned to a property.");
  const [tickets, residentData, moveOutRequests] = await Promise.all([
    getMaintenanceTickets(organizationId),
    getResidentSetupData(organizationId, propertyId),
    getPendingMoveOutRequests(organizationId, propertyId),
  ]);
  const data: OperationsData = {
    tickets,
    residents: residentData.residents
      .filter((resident) => resident.state === "active" || resident.state === "notice")
      .map((resident) => ({
        id: resident.id,
        fullName: resident.fullName,
        roomNumber: `${resident.roomCode} · ${resident.bedLabel}`,
        securityDeposit: resident.depositPromised,
        monthlyRent: resident.monthlyRent,
      })),
    noticePeriodCount: residentData.totals.noticeResidents,
    moveOutRequests,
  };
  return <OperationsWorkspace data={data} demoMode={false} canManage />;
}

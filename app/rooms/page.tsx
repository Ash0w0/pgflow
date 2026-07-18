import { RoomSetupWorkspace } from "@/components/room-setup-workspace";
import { requireStaffPage } from "@/lib/page-authorization";
import { getRoomSetupData } from "@/lib/room-setup";
import { isDemoRuntime } from "@/lib/runtime";

export default async function Page() {
  const authorization = await requireStaffPage(["owner"]);
  if (authorization.mode === "demo") {
    return <RoomSetupWorkspace data={{ floors: [], totals: { floors: 0, rooms: 0, beds: 0, vacantBeds: 0, maintenanceBeds: 0 } }} demoMode />;
  }
  if (!authorization.actor.propertyId) throw new Error("The owner is not assigned to a property.");
  const data = await getRoomSetupData(authorization.actor.organizationId, authorization.actor.propertyId);
  return <RoomSetupWorkspace data={data} demoMode={isDemoRuntime()} />;
}

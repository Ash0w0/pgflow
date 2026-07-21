import { GenericSection } from "@/components/generic-section";
import { ResidentSetupWorkspace } from "@/components/resident-setup-workspace";
import { requireStaffPage } from "@/lib/page-authorization";
import { getResidentSetupData } from "@/lib/resident-setup";
import { isDemoRuntime } from "@/lib/runtime";

export default async function Page() {
  const authorization = await requireStaffPage(["owner"]);
  if (authorization.mode === "demo") {
    return <GenericSection title="Residents" description="Profiles, occupancy and opening balances." label="resident" />;
  }
  if (!authorization.actor.propertyId) throw new Error("The owner is not assigned to a property.");
  const data = await getResidentSetupData(authorization.actor.organizationId, authorization.actor.propertyId);
  return <ResidentSetupWorkspace data={data} demoMode={isDemoRuntime()} />;
}

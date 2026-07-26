import { ReportsWorkspace } from "@/components/reports-workspace";
import { requireStaffPage } from "@/lib/page-authorization";
import { getReportsData } from "@/lib/reports";

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "accountant"]);
  if (authorization.mode === "demo") {
    const { getDemoReportsData } = await import("@/demo/reports");
    return <ReportsWorkspace data={getDemoReportsData()} demoMode />;
  }
  const { organizationId, propertyId } = authorization.actor;
  if (!propertyId) throw new Error("The staff member is not assigned to a property.");
  const data = await getReportsData(organizationId, propertyId);
  return <ReportsWorkspace data={data} demoMode={false} />;
}

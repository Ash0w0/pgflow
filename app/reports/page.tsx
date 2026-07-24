import { ReportsWorkspace } from "@/components/reports-workspace";
import { requireStaffPage } from "@/lib/page-authorization";

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "accountant"]);
  return <ReportsWorkspace demoMode={authorization.mode === "demo"} />;
}



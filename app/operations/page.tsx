import { OperationsWorkspace } from "@/components/operations-workspace";
import { requireStaffPage } from "@/lib/page-authorization";

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "manager"]);
  return <OperationsWorkspace demoMode={authorization.mode === "demo"} />;
}



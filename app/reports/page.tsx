import { GenericSection } from "@/components/generic-section";
import { requireStaffPage } from "@/lib/page-authorization";

export default async function Page() {
  await requireStaffPage(["owner", "accountant"]);
  return <GenericSection title="Reports" description="Collection, occupancy and deposit exports." label="report" />;
}

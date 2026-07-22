import { GenericSection } from "@/components/generic-section";
import { requireStaffPage } from "@/lib/page-authorization";

export default async function Page() {
  await requireStaffPage(["owner", "manager"]);
  return <GenericSection title="Operations" description="Complaints, notices and move-outs." label="ticket" />;
}

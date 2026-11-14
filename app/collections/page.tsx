import { CollectionsWorkspace } from "@/components/collections-workspace";
import { getCollectionsData } from "@/lib/collections";
import { requireStaffPage } from "@/lib/page-authorization";

export default async function Page() {
  const authorization = await requireStaffPage(["owner", "manager", "accountant"]);
  if (authorization.mode === "demo") {
    const { DemoCollections } = await import("@/demo/live/screens");
    return <DemoCollections />;
  }
  if (!authorization.actor.propertyId) throw new Error("The staff member is not assigned to a property.");
  const data = await getCollectionsData(authorization.actor.organizationId, authorization.actor.propertyId);
  return <CollectionsWorkspace data={data} canGenerate={authorization.actor.role === "owner"} canReview={["owner", "accountant"].includes(authorization.actor.role)} role={authorization.actor.role} />;
}

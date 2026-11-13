import type { Metadata } from "next";
import { ResidentApp } from "@/components/resident-app/resident-app";
import { requireTenantPage } from "@/lib/page-authorization";
import { getResidentAppData } from "@/lib/resident-app";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My PG", robots: { index: false, follow: false } };

export default async function TenantPage() {
  const authorization = await requireTenantPage();
  if (authorization.mode === "demo") {
    const { sampleResidentAppData } = await import("@/demo/resident-sample");
    return <ResidentApp data={sampleResidentAppData()} />;
  }
  const { actor } = authorization;
  if (!actor.propertyId || !actor.tenantId) throw new Error("This resident is not assigned to a room yet.");
  return <ResidentApp data={await getResidentAppData(actor.organizationId, actor.propertyId, actor.tenantId)} />;
}

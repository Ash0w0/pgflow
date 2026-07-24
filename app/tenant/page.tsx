import type { Metadata } from "next";
import { TenantApp } from "@/components/tenant-app";
import { requireTenantPage } from "@/lib/page-authorization";

export const metadata: Metadata = { title: "Resident home" };

export default async function TenantPage() {
  await requireTenantPage();
  return <TenantApp />;
}

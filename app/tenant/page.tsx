import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/page-authorization";
import { isDemoRuntime } from "@/lib/runtime";

export const metadata: Metadata = { title: "Resident home" };

export default async function TenantPage() {
  if (!isDemoRuntime()) notFound();
  await requireTenantPage();
  const { TenantApp } = await import("@/demo/components/tenant-app");
  return <TenantApp />;
}

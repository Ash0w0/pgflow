import type { Metadata } from "next";
import { TenantApp } from "@/components/tenant-app";

export const metadata: Metadata = { title: "Tenant home · Nivasa Demo House" };

export default function TenantPage() {
  return <TenantApp />;
}

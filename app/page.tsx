import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DemoDashboard } from "@/components/demo-dashboard";
import { requireStaffPage } from "@/lib/page-authorization";
import { isDemoRuntime } from "@/lib/runtime";

export const metadata: Metadata = {
  title: "Overview · Nivasa Demo House",
  description: "A fictional demonstration of the PGFlow white-label PG operations template.",
};

export default async function Home() {
  await requireStaffPage(["owner", "manager", "accountant"]);
  return <AppShell demoMode={isDemoRuntime()}><DemoDashboard /></AppShell>;
}

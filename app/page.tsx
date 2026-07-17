import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { DemoDashboard } from "@/components/demo-dashboard";

export const metadata: Metadata = {
  title: "Overview · Nivasa Demo House",
  description: "A fictional demonstration of the PGFlow white-label PG operations template.",
};

export default function Home() {
  return <AppShell><DemoDashboard /></AppShell>;
}

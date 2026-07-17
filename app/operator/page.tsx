import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { OperatorConsole } from "@/components/operator-console";

export const metadata: Metadata = { title: "Platform console" };

export default function OperatorPage() {
  return <AppShell><OperatorConsole /></AppShell>;
}

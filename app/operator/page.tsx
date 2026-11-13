import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LiveOperatorConsole } from "@/components/live-operator-console";
import { requireOperatorPage } from "@/lib/page-authorization";

export const metadata: Metadata = { title: "Platform console" };

export default async function OperatorPage() {
  const authorization = await requireOperatorPage();
  const demoMode = authorization.mode === "demo";
  if (demoMode) {
    const { OperatorConsole } = await import("@/demo/components/operator-console");
    return <AppShell demoMode><OperatorConsole /></AppShell>;
  }

  return (
    <AppShell demoMode={false} role="platform_operator">
      <LiveOperatorConsole />
    </AppShell>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { LiveOperatorConsole } from "@/components/live-operator-console";
import { OperatorConsole } from "@/components/operator-console";
import { requireOperatorPage } from "@/lib/page-authorization";

export const metadata: Metadata = { title: "Platform console" };

export default async function OperatorPage() {
  const authorization = await requireOperatorPage();
  const demoMode = authorization.mode === "demo";

  return (
    <AppShell demoMode={demoMode}>
      {demoMode ? <OperatorConsole /> : <LiveOperatorConsole />}
    </AppShell>
  );
}

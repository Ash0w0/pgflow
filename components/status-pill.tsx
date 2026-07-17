import type { ReactNode } from "react";

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral" | "info" | "lime";
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

import type { Metadata } from "next";
import { BulkImportWorkspace } from "@/components/bulk-import-workspace";
import { requireStaffPage } from "@/lib/page-authorization";

export const metadata: Metadata = { title: "Bulk import" };

export default async function ImportPage() {
  const authorization = await requireStaffPage(["owner"]);
  return <BulkImportWorkspace demoMode={authorization.mode === "demo"} />;
}

import type { Metadata } from "next";
import { SalesPresentation } from "@/components/sales-presentation";

export const metadata: Metadata = { title: "Product presentation" };

export default function PresentationPage() {
  return <SalesPresentation />;
}

import type { Metadata } from "next";
import { PaymentRequest } from "@/components/payment-request";

export const metadata: Metadata = { title: "Demo UPI request" };

export default async function PayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <PaymentRequest invoiceId={invoiceId} />;
}

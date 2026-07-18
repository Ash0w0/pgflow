import type { Metadata } from "next";
import { PaymentRequest } from "@/components/payment-request";
import { requireStaffPage } from "@/lib/page-authorization";
import { getPaymentRequestData } from "@/lib/payment-request-data";

export const metadata: Metadata = { title: "UPI payment request" };

export default async function PayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const authorization=await requireStaffPage(["owner","manager","accountant"]);
  if(authorization.mode==="demo")return <PaymentRequest data={null} />;
  if(!authorization.actor.propertyId)throw new Error("Property access is required.");
  const data=await getPaymentRequestData(authorization.actor.organizationId,authorization.actor.propertyId,invoiceId);
  return <PaymentRequest data={data} />;
}

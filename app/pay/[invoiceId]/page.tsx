import type { Metadata } from "next";
import { PaymentRequest } from "@/components/payment-request";
import { requireStaffPage } from "@/lib/page-authorization";
import { getPaymentRequestData, getPublicPaymentRequestData } from "@/lib/payment-request-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "UPI payment request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PayPage({ params, searchParams }: { params: Promise<{ invoiceId: string }>; searchParams: Promise<{ token?: string }> }) {
  const { invoiceId } = await params;
  const { token } = await searchParams;
  if (token) {
    const data = await getPublicPaymentRequestData(invoiceId, token);
    return <PaymentRequest data={data} accessToken={data ? token : null} invalidPublicLink={!data} />;
  }
  const authorization=await requireStaffPage(["owner","manager","accountant"]);
  if(authorization.mode==="demo")return <PaymentRequest data={null} />;
  if(!authorization.actor.propertyId)throw new Error("Property access is required.");
  const data=await getPaymentRequestData(authorization.actor.organizationId,authorization.actor.propertyId,invoiceId);
  return <PaymentRequest data={data} />;
}

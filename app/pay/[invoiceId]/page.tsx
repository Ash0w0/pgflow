import type { Metadata } from "next";
import { PaymentRequest } from "@/components/payment-request";
import { notFound } from "next/navigation";
import { requirePgPage } from "@/lib/page-authorization";
import { getPaymentRequestData, getPublicPaymentRequestData, invoiceBelongsToResident, residentIdForMembership } from "@/lib/payment-request-data";

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
  const authorization = await requirePgPage(["owner", "manager", "accountant", "tenant"]);
  if (authorization.mode === "demo") return <PaymentRequest data={null} />;
  const { actor } = authorization;
  if (!actor.propertyId) throw new Error("Property access is required.");
  const isResident = actor.role === "tenant";
  if (isResident) {
    // A resident may only open their own bill.
    const residentId = await residentIdForMembership(actor.organizationId, actor.membershipId);
    if (!residentId || !await invoiceBelongsToResident(actor.organizationId, actor.propertyId, invoiceId, residentId)) notFound();
  }
  const data = await getPaymentRequestData(actor.organizationId, actor.propertyId, invoiceId);
  return <PaymentRequest data={data} backHref={isResident ? "/tenant" : "/collections"} backLabel={isResident ? "Back to home" : "Back to Collections"} />;
}

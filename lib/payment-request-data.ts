import "server-only";
import { createUpiUri } from "./domain";
import { resolvePaymentLink } from "./payment-links";
import { getSupabaseAdmin } from "./supabase/admin";

export type LivePaymentRequest = { invoiceId:string; invoiceNumber:string; pgName:string; residentName:string; period:string; amount:number; upiId:string; payeeName:string; reference:string; upiUri:string; uploadedQrUrl:string|null };

export async function getPaymentRequestData(organizationId:string, propertyId:string, invoiceId:string):Promise<LivePaymentRequest> {
  const admin=getSupabaseAdmin();
  const [org,property,invoice]=await Promise.all([
    admin.from("organizations").select("name").eq("id",organizationId).single(),
    admin.from("properties").select("upi_id,upi_payee_name,upi_note_prefix,upi_qr_object_key").eq("organization_id",organizationId).eq("id",propertyId).single(),
    admin.from("invoices").select("id,tenant_id,number,period,total_amount,paid_amount,state").eq("organization_id",organizationId).eq("property_id",propertyId).eq("id",invoiceId).single(),
  ]);
  if(org.error||property.error||invoice.error)throw new Error("Payment request could not be loaded.");
  if(!["issued","partially_paid","overdue"].includes(invoice.data.state))throw new Error("This invoice is not payable.");
  const tenant=await admin.from("tenant_profiles").select("full_name").eq("organization_id",organizationId).eq("property_id",propertyId).eq("id",invoice.data.tenant_id).single();
  if(tenant.error)throw new Error("Resident could not be loaded.");
  const amount=Number(invoice.data.total_amount)-Number(invoice.data.paid_amount);
  const reference=`${property.data.upi_note_prefix}-${invoice.data.number}`.slice(0,35);
  const upiUri=createUpiUri({upiId:property.data.upi_id,payeeName:property.data.upi_payee_name,amount,reference});
  let uploadedQrUrl:string|null=null;if(property.data.upi_qr_object_key){const signed=await admin.storage.from("upi-qr-assets").createSignedUrl(property.data.upi_qr_object_key,900);if(!signed.error)uploadedQrUrl=signed.data.signedUrl;}
  return{invoiceId:invoice.data.id,invoiceNumber:invoice.data.number,pgName:org.data.name,residentName:tenant.data.full_name,period:invoice.data.period,amount,upiId:property.data.upi_id,payeeName:property.data.upi_payee_name,reference,upiUri,uploadedQrUrl};
}

export async function getPublicPaymentRequestData(invoiceId: string, token: string): Promise<LivePaymentRequest | null> {
  const context = await resolvePaymentLink(token, invoiceId, { recordOpen: true });
  if (!context) return null;
  return getPaymentRequestData(context.organizationId, context.propertyId, context.invoiceId);
}

export async function residentIdForMembership(organizationId: string, membershipId: string): Promise<string | null> {
  const { data } = await getSupabaseAdmin().from("tenant_profiles").select("id")
    .eq("organization_id", organizationId).eq("membership_id", membershipId).in("state", ["active", "notice"]).maybeSingle();
  return data?.id ?? null;
}

export async function invoiceBelongsToResident(organizationId: string, propertyId: string, invoiceId: string, residentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return false;
  const { data } = await getSupabaseAdmin().from("invoices").select("id")
    .eq("organization_id", organizationId).eq("property_id", propertyId).eq("id", invoiceId).eq("tenant_id", residentId).maybeSingle();
  return Boolean(data);
}

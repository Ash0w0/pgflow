import "server-only";
import { createUpiUri } from "./domain";
import { hashPaymentLinkToken, isPaymentLinkToken, resolvePaymentLink } from "./payment-links";
import { getSupabaseAdmin } from "./supabase/admin";

export type LivePaymentRequest = {
  invoiceId:string; invoiceNumber:string; pgName:string; residentName:string; period:string;
  amount:number; upiId:string; payeeName:string; reference:string; upiUri:string;
  uploadedQrUrl:string|null;
  journeyState: "payable" | "rejected" | "under_review" | "approved";
  rejectionReason?: string | null;
  receiptNumber?: string | null;
};

async function loadPaymentRequestData(organizationId:string, propertyId:string, invoiceId:string, requirePayable=true):Promise<LivePaymentRequest> {
  const admin=getSupabaseAdmin();
  const [org,property,invoice]=await Promise.all([
    admin.from("organizations").select("name").eq("id",organizationId).single(),
    admin.from("properties").select("upi_id,upi_payee_name,upi_note_prefix,upi_qr_object_key").eq("organization_id",organizationId).eq("id",propertyId).single(),
    admin.from("invoices").select("id,tenant_id,number,period,total_amount,paid_amount,state").eq("organization_id",organizationId).eq("property_id",propertyId).eq("id",invoiceId).single(),
  ]);
  if(org.error||property.error||invoice.error)throw new Error("Payment request could not be loaded.");
  if(requirePayable&&!["issued","partially_paid","overdue"].includes(invoice.data.state))throw new Error("This invoice is not payable.");
  const tenant=await admin.from("tenant_profiles").select("full_name").eq("organization_id",organizationId).eq("property_id",propertyId).eq("id",invoice.data.tenant_id).single();
  if(tenant.error)throw new Error("Resident could not be loaded.");
  const outstanding=Number(invoice.data.total_amount)-Number(invoice.data.paid_amount);
  const amount=requirePayable?outstanding:Math.max(outstanding,Number(invoice.data.total_amount));
  const reference=`${property.data.upi_note_prefix}-${invoice.data.number}`.slice(0,35);
  const upiUri=createUpiUri({upiId:property.data.upi_id,payeeName:property.data.upi_payee_name,amount,reference});
  let uploadedQrUrl:string|null=null;if(property.data.upi_qr_object_key){const signed=await admin.storage.from("upi-qr-assets").createSignedUrl(property.data.upi_qr_object_key,900);if(!signed.error)uploadedQrUrl=signed.data.signedUrl;}
  return{invoiceId:invoice.data.id,invoiceNumber:invoice.data.number,pgName:org.data.name,residentName:tenant.data.full_name,period:invoice.data.period,amount,upiId:property.data.upi_id,payeeName:property.data.upi_payee_name,reference,upiUri,uploadedQrUrl,journeyState:"payable"};
}

export async function getPaymentRequestData(organizationId:string, propertyId:string, invoiceId:string):Promise<LivePaymentRequest> {
  return loadPaymentRequestData(organizationId, propertyId, invoiceId, true);
}

export async function getPublicPaymentRequestData(invoiceId: string, token: string): Promise<LivePaymentRequest | null> {
  if (!isPaymentLinkToken(token)) return null;
  const admin=getSupabaseAdmin();
  const {data:request}=await admin.from("invoice_payment_requests")
    .select("id,organization_id,property_id,invoice_id,state,expires_at")
    .eq("token_hash",hashPaymentLinkToken(token)).eq("invoice_id",invoiceId)
    .in("state",["active","submitted"]).gt("expires_at",new Date().toISOString()).maybeSingle();
  if(!request)return null;
  if(request.state==="active")await resolvePaymentLink(token,invoiceId,{recordOpen:true});
  const base=await loadPaymentRequestData(request.organization_id,request.property_id,request.invoice_id,false);
  const {data:payment}=await admin.from("payments").select("id,state,rejection_reason")
    .eq("organization_id",request.organization_id).eq("payment_request_id",request.id)
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(!payment)return base;
  if(payment.state==="pending_review")return{...base,journeyState:"under_review"};
  if(payment.state==="rejected")return{...base,journeyState:"rejected",rejectionReason:payment.rejection_reason};
  if(payment.state==="approved"){
    const {data:receipt}=await admin.from("receipts").select("number")
      .eq("organization_id",request.organization_id).eq("payment_id",payment.id).maybeSingle();
    return{...base,journeyState:"approved",receiptNumber:receipt?.number??null};
  }
  return base;
}

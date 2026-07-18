import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root=new URL("../../",import.meta.url);

test("direct UPI and cash ledger is immutable, scoped, manually reviewed, allocated and receipted",async()=>{
  const sql=await readFile(new URL("supabase/migrations/0021_direct_upi_cash_ledger.sql",root),"utf8");
  for(const fn of ["update_property_upi","submit_upi_payment_evidence","review_payment","record_cash_payment"])assert.match(sql,new RegExp(`create or replace function public\\.${fn}`,"i"));
  assert.match(sql,/security definer set search_path = ''/i);
  assert.match(sql,/v_invoice\.total_amount-v_invoice\.paid_amount/i);
  assert.match(sql,/'pending_review'/i);
  assert.match(sql,/'autoApproved',false/i);
  assert.match(sql,/insert into public\.payment_allocations/i);
  assert.match(sql,/insert into public\.receipts/i);
  assert.match(sql,/payment\.approved/i);
  assert.match(sql,/receivingStaffId/i);
  assert.match(sql,/require_cash_approval/i);
  assert.match(sql,/unique \(organization_id, payment_id\)/i);
  assert.match(sql,/insert into public\.payment_evidence/i);
  assert.doesNotMatch(sql,/grant execute on function public\.(?:review_payment|record_cash_payment)[\s\S]*?to authenticated/i);
});

test("payment routes derive tenancy from authenticated actors and persist through RPCs",async()=>{
  const paths=["app/api/payments/cash/route.ts","app/api/payments/evidence/route.ts","app/api/payments/review/route.ts"];
  const routes=await Promise.all(paths.map(path=>readFile(new URL(path,root),"utf8")));
  for(const route of routes){assert.match(route,/isTrustedMutationRequest\(request\)/);assert.match(route,/p_actor_user_id: actor\.id/);assert.match(route,/p_organization_id: actor\.organizationId/);assert.match(route,/p_property_id: actor\.propertyId/);assert.doesNotMatch(route,/persisted: false|Contract preview only/);}
  assert.match(routes[0],/rpc\("record_cash_payment"/);assert.match(routes[1],/rpc\("submit_upi_payment_evidence"/);assert.match(routes[1],/storage\.from\("payment-evidence"\)\.remove/);assert.match(routes[2],/rpc\("review_payment"/);
});

test("UPI destination requires owner password and payment proof never auto-approves",async()=>{
  const [settings,card,payment,upload]=await Promise.all([
    readFile(new URL("app/api/settings/upi/route.ts",root),"utf8"),readFile(new URL("components/upi-settings-card.tsx",root),"utf8"),readFile(new URL("components/payment-request.tsx",root),"utf8"),readFile(new URL("app/api/uploads/payment-evidence/route.ts",root),"utf8")]);
  assert.match(settings,/requireActor\(request, \["owner"\]\)/);assert.match(settings,/verifyOwnerPassword/);assert.match(settings,/consumeAuthenticationLimits/);assert.match(card,/autoComplete="current-password"/);assert.doesNotMatch(card,/localStorage|sessionStorage/);
  assert.match(payment,/QRCode\.toDataURL\(data\.upiUri/);assert.match(payment,/Submit proof for review/);assert.match(payment,/invoice is still unpaid until approval/i);assert.match(upload,/invoice\.tenant_id !== actor\.tenantId/);
});

test("owner-uploaded UPI QR is optional, private, tenant-scoped, and secondary to the exact invoice QR",async()=>{
  const [sql,upload,settings,card,data,payment]=await Promise.all([
    readFile(new URL("supabase/migrations/0022_owner_uploaded_upi_qr.sql",root),"utf8"),readFile(new URL("app/api/uploads/upi-qr/route.ts",root),"utf8"),readFile(new URL("app/api/settings/upi/route.ts",root),"utf8"),readFile(new URL("components/upi-settings-card.tsx",root),"utf8"),readFile(new URL("lib/payment-request-data.ts",root),"utf8"),readFile(new URL("components/payment-request.tsx",root),"utf8")]);
  assert.match(sql,/upi_qr_object_key/);assert.match(sql,/upi-qr-assets/);assert.match(sql,/public false|public,file_size_limit/i);assert.match(sql,/has_storage_org_membership\(name,array\['owner'\]/i);assert.match(sql,/organizations\/[^']*upi-qr/i);
  assert.match(upload,/requireActor\(request,\["owner"\]\)/);assert.match(upload,/MAX_BYTES=2\*1024\*1024/);assert.match(upload,/matchesMagic/);assert.match(upload,/storage\.from\("upi-qr-assets"\)\.upload/);
  assert.match(settings,/verifyOwnerPassword/);assert.match(settings,/p_qr_object_key/);assert.match(settings,/storage\.from\("upi-qr-assets"\)\.remove/);assert.match(card,/Existing UPI QR/);assert.match(card,/type="file"/);
  assert.match(data,/createSignedUrl/);assert.match(payment,/Recommended · exact invoice QR/);assert.match(payment,/owner-uploaded UPI QR/);assert.match(payment,/may not prefill the invoice amount/i);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("secure invoice links are hash-only, expiring, replaceable, scoped and manually reviewed", async () => {
  const sql = await readFile(new URL("supabase/migrations/0023_secure_invoice_payment_links.sql", root), "utf8");
  assert.match(sql, /token_hash text not null unique/);
  assert.doesNotMatch(sql, /\btoken text\b/i);
  assert.match(sql, /p_expires_at > pg_catalog\.now\(\) \+ interval '14 days'/);
  assert.match(sql, /set state = 'revoked', revoked_at = pg_catalog\.now\(\)/);
  assert.match(sql, /and state = 'pending_review'/);
  assert.match(sql, /submission_channel = 'public_payment_link'/);
  assert.match(sql, /actor_kind[^\n]*'public_payment_link'/);
  assert.match(sql, /'autoApproved', false/);
  assert.match(sql, /set state = 'submitted', submitted_at = pg_catalog\.now\(\)/);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  assert.doesNotMatch(sql, /grant execute[\s\S]*?to (anon|authenticated)/i);
});

test("payment-link API derives tenancy from staff and returns only the one-time raw URL", async () => {
  const [route, service] = await Promise.all([
    readFile(new URL("app/api/payment-requests/route.ts", root), "utf8"),
    readFile(new URL("lib/payment-links.ts", root), "utf8"),
  ]);
  assert.match(route, /requireActor\(request, \["owner", "manager", "accountant"\]\)/);
  assert.match(route, /p_organization_id: actor\.organizationId/);
  assert.match(route, /p_property_id: actor\.propertyId/);
  assert.match(route, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /paymentUrl\.searchParams\.set\("token", token\)/);
  assert.match(route, /requestHostname\(request\)/);
  assert.match(route, /request\.headers\.get\("origin"\)/);
  assert.match(route, /verifiedPaymentOrigin\(request\)/);
  assert.doesNotMatch(route, /new URL\(`\/pay\/\$\{body\.invoiceId\}`, request\.url\)/);
  assert.match(service, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.doesNotMatch(service, /localStorage|sessionStorage/);
});

test("public proof upload and submission revalidate the exact payment link", async () => {
  const [upload, evidence, page, component] = await Promise.all([
    readFile(new URL("app/api/uploads/payment-evidence/route.ts", root), "utf8"),
    readFile(new URL("app/api/payments/evidence/route.ts", root), "utf8"),
    readFile(new URL("app/pay/[invoiceId]/page.tsx", root), "utf8"),
    readFile(new URL("components/payment-request.tsx", root), "utf8"),
  ]);
  assert.match(upload, /resolvePaymentLink\(token, invoiceId\)/);
  assert.match(upload, /invoice\?\.tenant_id === publicContext\.tenantId/);
  assert.match(upload, /publicContext \? admin\.storage/);
  assert.match(evidence, /submit_public_upi_payment_evidence/);
  assert.match(evidence, /hashPaymentLinkToken\(token\)/);
  assert.match(page, /getPublicPaymentRequestData\(invoiceId, token\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.match(component, /if \(accessToken\) form\.set\("token", accessToken\)/);
  assert.match(component, /invoice is still unpaid until approval/i);
});

test("Collections shares only a user-reviewed WhatsApp draft", async () => {
  const workspace = await readFile(new URL("components/collections-workspace.tsx", root), "utf8");
  assert.match(workspace, /fetch\("\/api\/payment-requests"/);
  assert.match(workspace, /https:\/\/wa\.me\/\$\{whatsappPhone\}/);
  assert.match(workspace, /Open WhatsApp draft/);
  assert.match(workspace, /Review the phone number and message before pressing Send/);
  assert.doesNotMatch(workspace, /graph\.facebook\.com|WHATSAPP_ACCESS_TOKEN/);
});

test("the database refuses payment links until the exact property has UPI configured", async () => {
  const sql = await readFile(new URL("supabase/migrations/0024_require_upi_before_payment_link.sql", root), "utf8");
  assert.match(sql, /before insert on public\.invoice_payment_requests/);
  assert.match(sql, /organization_id = new\.organization_id/);
  assert.match(sql, /id = new\.property_id/);
  assert.match(sql, /nullif\(pg_catalog\.btrim\(upi_id\), ''\) is not null/);
  assert.match(sql, /nullif\(pg_catalog\.btrim\(upi_payee_name\), ''\) is not null/);
  assert.match(sql, /Configure the property UPI ID and payee name/);
});

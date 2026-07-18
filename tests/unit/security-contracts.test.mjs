import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("service worker never caches private tenant or financial routes", async () => {
  const source = await readFile(new URL("public/sw.js", root), "utf8");
  assert.doesNotMatch(source, /SAFE_ASSETS[^;]*\/tenant/);
  assert.doesNotMatch(source, /caches\.match\(["']\/tenant/);
  assert.match(source, /request\.mode === ["']navigate/);
  assert.match(source, /\/api\//);
});

test("payment demo emits no UPI scheme while live UPI comes from authorized server data", async () => {
  const [source, page, data] = await Promise.all([
    readFile(new URL("components/payment-request.tsx", root), "utf8"),
    readFile(new URL("app/pay/[invoiceId]/page.tsx", root), "utf8"),
    readFile(new URL("lib/payment-request-data.ts", root), "utf8"),
  ]);
  assert.doesNotMatch(source, /upi:\/\/pay/i);
  assert.doesNotMatch(source, /demo\.nivasa@upi/i);
  assert.match(source, /if\(!data\)return/);
  assert.match(source, /fictional demo never emits a real UPI destination/i);
  assert.match(source, /QRCode\.toDataURL\(data\.upiUri/);
  assert.match(page, /requireStaffPage\(\["owner","manager","accountant"\]\)/);
  assert.match(data, /createUpiUri/);
});

test("starter preview is fully removed", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("package.json", root), "utf8"),
  ]);
  assert.doesNotMatch(page + layout + packageJson, /SkeletonPreview|codex-preview|react-loading-skeleton|Starter Project/);
  assert.match(layout, /PGFlow/);
});

test("production RLS separates tenant records from organization-wide finance", async () => {
  const [sql, hardening, rlsTests] = await Promise.all([
    readFile(new URL("supabase/migrations/0001_platform.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0002_production_foundation.sql", root), "utf8"),
    readFile(new URL("supabase/tests/rls.sql", root), "utf8"),
  ]);
  assert.match(sql, /is_own_tenant/);
  assert.match(sql, /invoices_scoped_select/);
  assert.match(sql, /payments_scoped_select/);
  assert.match(sql, /evidence_scoped_select/);
  assert.doesNotMatch(sql, /properties_org_access|rooms_org_access|beds_org_access|payments_org_select|invoices_org_select/);
  assert.match(sql, /foreign key \(organization_id, tenant_id\)/);
  assert.match(sql, /intentionally have no client mutation policy/);
  assert.match(hardening, /revoke all on all tables in schema public from anon/i);
  assert.match(hardening, /revoke all on all tables in schema public from authenticated/i);
  assert.doesNotMatch(hardening, /grant (?:insert|update|delete).*public\.(?:memberships|properties|brand_themes|rooms|beds|tenant_profiles|occupancies)/i);
  assert.match(hardening, /platform_operators/i);
  assert.match(hardening, /payment_evidence_select/i);
  assert.match(hardening, /owner_id = auth\.uid\(\)::text/i);
  assert.match(rlsTests, /tenant sees only their profile/i);
  assert.match(rlsTests, /disabled membership has no organization access/i);
});

test("production actor identity never trusts caller-supplied tenancy headers", async () => {
  const source = await readFile(new URL("lib/http.ts", root), "utf8");
  assert.doesNotMatch(source, /APP_ACTION_TOKEN/);
  assert.doesNotMatch(source, /x-organization-id|x-app-role|x-actor-id|x-tenant-id/i);
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /eq\("organization_id", tenantContext\.organizationId\)/);
  assert.match(source, /eq\("state", "active"\)/);
  assert.match(source, /isTrustedMutationRequest/);
  assert.doesNotMatch(source, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  assert.match(source, /OPERATOR_HOSTNAME/);
  assert.match(source, /requestHost !== operatorHostname/);
});

test("trusted mutations validate the public proxy origin and fail closed", async () => {
  const source = await readFile(new URL("lib/http.ts", root), "utf8");
  const mutationStart = source.indexOf("export function isTrustedMutationRequest");
  const actorStart = source.indexOf("export async function requireActor");
  assert.notEqual(mutationStart, -1);
  assert.notEqual(actorStart, -1);
  const mutationSource = source.slice(mutationStart, actorStart);

  assert.match(mutationSource, /const expectedHostname = requestHostname\(request\);/);
  assert.match(
    mutationSource,
    /if \(!expectedHostname \|\| normalizeHostname\(originUrl\.hostname\) !== expectedHostname\) return false;/,
  );
  assert.match(mutationSource, /request\.headers\.get\("x-forwarded-proto"\)\?\.trim\(\)\.toLowerCase\(\)/);
  assert.match(mutationSource, /if \(forwardedProtocol\.includes\(","\)\) return false;/);
  assert.match(mutationSource, /forwardedProtocol === "http" \|\| forwardedProtocol === "https"/);
  assert.match(mutationSource, /if \(originUrl\.protocol !== expectedProtocol\) return false;/);
  assert.match(
    mutationSource,
    /request\.headers\.get\("host"\)\s+\?\? request\.headers\.get\("x-forwarded-host"\)\s+\?\? requestUrl\.host/,
  );
  assert.match(mutationSource, /if \(authority\.includes\(","\)\) return false;/);
  assert.match(mutationSource, /const portMatch = authority\.match\(\/\:\(\\d\{1,5\}\)\$\/\);/);
  assert.match(mutationSource, /return expectedPort === originPort;/);
  assert.doesNotMatch(mutationSource, /originUrl\.origin\s*[!=]==?\s*requestUrl\.origin/);
});

test("production hostname and storage boundaries fail closed", async () => {
  const [branding, tenancy, upload, hostnameHardening, rlsTests] = await Promise.all([
    readFile(new URL("lib/branding.ts", root), "utf8"),
    readFile(new URL("lib/tenancy.ts", root), "utf8"),
    readFile(new URL("app/api/uploads/payment-evidence/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/0005_domain_hostname_hardening.sql", root), "utf8"),
    readFile(new URL("supabase/tests/rls.sql", root), "utf8"),
  ]);
  assert.match(branding, /\?\? null/);
  assert.doesNotMatch(branding, /\?\? approvedDemoHosts\.localhost/);
  assert.match(tenancy, /eq\("hostname", hostname\)/);
  assert.match(tenancy, /eq\("state", "verified"\)/);
  assert.doesNotMatch(upload, /cloudflare:workers/);
  assert.match(upload, /storage\.from\("payment-evidence"\)/);
  assert.match(hostnameHardening, /drop constraint if exists domain_mappings_normalized_hostname_check/i);
  assert.match(hostnameHardening, /add constraint domain_mappings_normalized_hostname_check/i);
  assert.match(hostnameHardening, /hostname = pg_catalog\.lower\(pg_catalog\.btrim\(hostname\)\)/i);
  assert.match(hostnameHardening, /pg_catalog\.char_length\(hostname\) between 1 and 253/i);
  assert.ok(hostnameHardening.includes("hostname !~ '[,/:]'"));
  assert.ok(hostnameHardening.includes("hostname !~ '[[:space:][:cntrl:]]'"));
  assert.ok(hostnameHardening.includes("[a-z0-9-]{0,61}"));
  assert.doesNotMatch(hostnameHardening, /OPERATOR_HOSTNAME/i);
  assert.match(rlsTests, /aster-test-house\.localhost,evil\.example/);
  assert.match(rlsTests, /double\.\.dot\.example/);
  assert.match(rlsTests, /pg_catalog\.repeat\('a', 64\)/);
});

test("hostname resolution separates public branding from operational tenant access", async () => {
  const [tenancy, manifest, icon] = await Promise.all([
    readFile(new URL("lib/tenancy.ts", root), "utf8"),
    readFile(new URL("app/manifest.webmanifest/route.ts", root), "utf8"),
    readFile(new URL("app/api/branding/icon/route.ts", root), "utf8"),
  ]);

  const requestHostnameStart = tenancy.indexOf("export function requestHostname");
  const publicResolverStart = tenancy.indexOf("export async function resolvePublicBrandContextForHostname");
  assert.notEqual(requestHostnameStart, -1);
  assert.notEqual(publicResolverStart, -1);
  const requestHostnameSource = tenancy.slice(requestHostnameStart, publicResolverStart);

  assert.match(tenancy, /if \(!rawValue \|\| rawValue\.includes\(","\)\) return "";/);
  assert.match(requestHostnameSource, /const host = request\.headers\.get\("host"\);\s+if \(host !== null\) return safeHostnameCandidate\(host\);/);
  assert.match(requestHostnameSource, /safeHostnameCandidate\(new URL\(request\.url\)\.hostname\)/);
  assert.ok(
    requestHostnameSource.indexOf("return safeHostnameCandidate(host)")
      < requestHostnameSource.indexOf("new URL(request.url).hostname"),
    "a present but invalid Host header must return the rejected candidate before the URL fallback",
  );

  for (const publicSurface of [manifest, icon]) {
    assert.match(publicSurface, /resolvePublicBrandContext\(request\)/);
    assert.doesNotMatch(publicSurface, /resolveTenantContext\(request\)/);
  }

  assert.match(
    tenancy,
    /resolveTenantContextForHostname[\s\S]*?const context = await resolvePublicBrandContextForHostname\(rawHostname\);\s+return context && isOperationalTenant\(context\) \? context : null;/,
  );
  assert.match(
    tenancy,
    /resolveTenantContext\(request: Request\)[\s\S]*?return resolveTenantContextForHostname\(requestHostname\(request\)\);/,
  );
  assert.match(tenancy, /\["demo", "core_ready", "integrations_pending", "live"\]\.includes\(context\.state\)/);

  const publicResolverSource = tenancy.slice(publicResolverStart);
  const operatorReservation = publicResolverSource.indexOf("hostname === operatorHostname");
  const domainLookup = publicResolverSource.indexOf('.from("domain_mappings")');
  assert.match(publicResolverSource, /safeHostnameCandidate\(process\.env\.OPERATOR_HOSTNAME \?\? null\)/);
  assert.ok(operatorReservation !== -1 && domainLookup !== -1 && operatorReservation < domainLookup);
  assert.match(publicResolverSource, /if \(operatorHostname && hostname === operatorHostname\) return null;/);
});

test("dynamic PWA manifest is host-branded without caching private context", async () => {
  const [manifest, icon] = await Promise.all([
    readFile(new URL("app/manifest.webmanifest/route.ts", root), "utf8"),
    readFile(new URL("app/api/branding/icon/route.ts", root), "utf8"),
  ]);

  assert.match(manifest, /resolvePublicBrandContext\(request\)/);
  assert.doesNotMatch(manifest, /resolveTenantContext\(request\)/);
  assert.match(manifest, /if \(!brand\)/);
  assert.match(manifest, /status: 404/);
  assert.match(manifest, /isDemoRuntime\(\)/);
  assert.match(manifest, /A fictional demonstration/);
  assert.match(manifest, /Branded PG operations for \$\{brand\.name\}/);
  assert.match(manifest, /name: brand\.name/);
  assert.match(manifest, /short_name: brand\.shortName/);
  assert.match(manifest, /theme_color: brand\.primary/);
  assert.match(manifest, /start_url: brand\.startUrl/);
  assert.match(manifest, /"cache-control": "no-store"/);
  assert.match(manifest, /src: "\/api\/branding\/icon"/);
  assert.match(manifest, /purpose: "any maskable"/);
  assert.doesNotMatch(manifest, /tenant_profiles|invoices|payments|phone|balance|due/i);

  assert.match(icon, /resolvePublicBrandContext\(request\)/);
  assert.doesNotMatch(icon, /resolveTenantContext\(request\)/);
  assert.match(icon, /status: 404/);
  assert.match(icon, /HEX_COLOR_PATTERN\.test\(value\)/);
  assert.match(icon, /\\p\{L\}/);
  assert.match(icon, /\\p\{N\}/);
  assert.match(icon, /\?\? "P"/);
  assert.match(icon, /escapeXml\(brandInitial/);
  assert.match(icon, /"content-type": "image\/svg\+xml; charset=utf-8"/);
  assert.match(icon, /"cache-control": "no-store"/);
  assert.match(icon, /"x-content-type-options": "nosniff"/);
  assert.match(icon, /script-src 'none'/);
  assert.doesNotMatch(icon, /<script|\$\{brand\.(?:shortName|name)\}/i);
  assert.doesNotMatch(icon, /tenant_profiles|invoices|payments|phone|balance|due/i);
});

test("protected pages re-authorize users at the server component boundary", async () => {
  const [authorization, tenancy, staffPages, tenantPage, operatorPage] = await Promise.all([
    readFile(new URL("lib/page-authorization.ts", root), "utf8"),
    readFile(new URL("lib/tenancy.ts", root), "utf8"),
    Promise.all([
      "app/page.tsx",
      "app/collections/page.tsx",
      "app/residents/page.tsx",
      "app/rooms/page.tsx",
      "app/operations/page.tsx",
      "app/reports/page.tsx",
      "app/settings/page.tsx",
    ].map((path) => readFile(new URL(path, root), "utf8"))).then((sources) => sources.join("\n")),
    readFile(new URL("app/tenant/page.tsx", root), "utf8"),
    readFile(new URL("app/operator/page.tsx", root), "utf8"),
  ]);

  assert.match(authorization, /import "server-only"/);
  assert.match(authorization, /auth\.getUser\(\)/);
  assert.match(authorization, /resolvePublicBrandContextForHostname/);
  assert.match(authorization, /\.eq\("organization_id", tenant\.organizationId\)/);
  assert.match(authorization, /\.eq\("state", "active"\)/);
  assert.match(authorization, /canAccessTenantWorkspace\(tenant, role\)/);
  assert.match(
    tenancy,
    /isOperationalTenant\(context\) \|\| \(context\.state === "draft" && role === "owner"\)/,
  );
  assert.match(authorization, /redirect\("\/login"\)/);
  assert.match(authorization, /OPERATOR_HOSTNAME/);
  assert.match(authorization, /from\("platform_operators"\)/);
  assert.equal((staffPages.match(/requireStaffPage\(/g) ?? []).length, 7);
  assert.match(tenantPage, /requireTenantPage\(\)/);
  assert.match(operatorPage, /requireOperatorPage\(\)/);
});

test("public authentication is database-throttled without storing raw identifiers", async () => {
  const [migration, limiter, signIn, changePassword] = await Promise.all([
    readFile(new URL("supabase/migrations/0009_auth_rate_limits.sql", root), "utf8"),
    readFile(new URL("lib/auth-rate-limit.ts", root), "utf8"),
    readFile(new URL("app/api/auth/sign-in/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/change-password/route.ts", root), "utf8"),
  ]);

  assert.match(migration, /create table public\.auth_rate_limit_buckets/i);
  assert.match(migration, /bucket_hash text primary key/i);
  assert.doesNotMatch(migration, /^\s*(?:phone|ip_address|raw_identifier)\s+\w+/im);
  assert.match(migration, /alter table public\.auth_rate_limit_buckets enable row level security/i);
  assert.match(migration, /revoke all on public\.auth_rate_limit_buckets from public, anon, authenticated, service_role/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /on conflict \(bucket_hash\) do update/i);
  assert.match(migration, /grant execute[\s\S]*?to service_role/i);
  assert.match(limiter, /HMAC/);
  assert.match(limiter, /consume_auth_rate_limit/);
  assert.match(limiter, /PHONE_LIMIT = 10/);
  assert.match(limiter, /IP_LIMIT = 30/);
  for (const route of [signIn, changePassword]) {
    assert.match(route, /consumeAuthenticationLimits/);
    assert.match(route, /status: 429/);
    assert.match(route, /"retry-after"/);
  }
});

test("owner credential issuance requires a fresh operator password check", async () => {
  const [reauth, invitationRoute, resetRoute, panel] = await Promise.all([
    readFile(new URL("lib/operator-reauth.ts", root), "utf8"),
    readFile(new URL("app/api/owner-invitations/route.ts", root), "utf8"),
    readFile(new URL("app/api/owner-credentials/reset/route.ts", root), "utf8"),
    readFile(new URL("components/owner-invitation-panel.tsx", root), "utf8"),
  ]);

  assert.match(reauth, /import "server-only"/);
  assert.match(reauth, /admin\.getUserById\(operatorUserId\)/);
  assert.match(reauth, /persistSession: false/);
  assert.match(reauth, /signInWithPassword/);
  assert.match(reauth, /data\.user\?\.id === operatorUserId/);
  assert.match(reauth, /signOut\(\{ scope: "local" \}\)/);
  for (const route of [invitationRoute, resetRoute]) {
    assert.match(route, /verifyOperatorPassword\(operatorUserId, operatorPassword\)/);
    assert.match(route, /operatorPassword/);
  }
  assert.equal((panel.match(/autoComplete="current-password"/g) ?? []).length, 2);
  assert.match(panel, /operatorPassword/);
  assert.match(panel, /resetOperatorPassword/);
});

test("manual owner recovery is one-time, intent-bound, and server-only", async () => {
  const [migration, issueRoute, recoverRoute, recoveryLibrary, recoveryForm] = await Promise.all([
    readFile(new URL("supabase/migrations/0010_manual_owner_password_recovery.sql", root), "utf8"),
    readFile(new URL("app/api/owner-password-recovery/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/recover-password/route.ts", root), "utf8"),
    readFile(new URL("lib/owner-password-recovery.ts", root), "utf8"),
    readFile(new URL("components/recovery-form.tsx", root), "utf8"),
  ]);

  assert.match(migration, /create table public\.owner_password_recoveries/i);
  assert.match(migration, /credential_hash text/i);
  assert.match(migration, /password_intent_hash text/i);
  assert.doesNotMatch(migration, /\bcredential\s+text|\bnew_password\b|\bplaintext\b/i);
  assert.match(migration, /state in \('issued', 'processing', 'completed', 'revoked'\)/i);
  assert.match(migration, /owner_password_recoveries_one_live_per_owner_uq/i);
  assert.match(migration, /alter table public\.owner_password_recoveries enable row level security/i);
  assert.match(migration, /revoke all on public\.owner_password_recoveries from public, anon, authenticated, service_role/i);
  for (const rpc of [
    "issue_owner_password_recovery",
    "claim_owner_password_recovery",
    "complete_owner_password_recovery",
  ]) {
    assert.match(migration, new RegExp(`security definer[\\s\\S]*?${rpc}|${rpc}[\\s\\S]*?security definer`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`, "i"));
  }
  assert.match(migration, /credential_hash = null[\s\S]*?state = 'completed'|state = 'completed'[\s\S]*?credential_hash = null/i);
  assert.doesNotMatch(migration, /after_data[\s\S]{0,500}credential_hash/i);

  assert.match(issueRoute, /verifyOperatorPassword\(operatorUserId, operatorPassword\)/);
  assert.match(issueRoute, /manualPhoneConfirmed/);
  assert.match(issueRoute, /issue_owner_password_recovery/);
  assert.match(recoveryLibrary, /recoveryRequestId.*credential.*newPassword/s);
  assert.match(recoverRoute, /claim_owner_password_recovery/);
  assert.match(recoverRoute, /updateUserById\(claim\.authUserId, \{ password: newPassword \}\)/);
  assert.match(recoverRoute, /signOut\(\{ scope: "global" \}\)/);
  assert.match(recoverRoute, /complete_owner_password_recovery/);
  assert.doesNotMatch(recoverRoute, /signInWithPassword\(\{\s*phone,\s*password: credential/s);
  assert.match(recoveryForm, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(recoveryForm, /localStorage|sessionStorage|document\.cookie/);
});

test("authenticated owner password changes reauthorize and revoke sessions", async () => {
  const [route, card, settings] = await Promise.all([
    readFile(new URL("app/api/auth/update-password/route.ts", root), "utf8"),
    readFile(new URL("components/password-change-card.tsx", root), "utf8"),
    readFile(new URL("app/settings/page.tsx", root), "utf8"),
  ]);

  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /user\.id !== actor\.id/);
  assert.match(route, /consumeAuthenticationLimits/);
  assert.match(route, /verifyExactPassword\(user\.id, user\.phone, currentPassword\)/);
  assert.match(route, /updateUserById\(user\.id, \{ password: newPassword \}\)/);
  assert.match(route, /verifyNewPasswordAndRevokeSessions/);
  assert.match(route, /signOut\(\{ scope: "global" \}\)/);
  assert.match(route, /action: "account_password\.changed"/);
  assert.match(route, /after_data:\s*\{ sessionsRevoked: true, method: "current_password" \}/);
  assert.doesNotMatch(route, /after_data:\s*\{[^}]*(?:currentPassword|newPassword)/);
  assert.match(card, /autoComplete="current-password"/);
  assert.equal((card.match(/autoComplete="new-password"/g) ?? []).length, 2);
  assert.doesNotMatch(card, /localStorage|sessionStorage|document\.cookie/);
  assert.match(settings, /<PasswordChangeCard/);
});

test("platform operator can rotate an exposed password without browser persistence", async () => {
  const [route, reauth, card, consoleSource, loginForm] = await Promise.all([
    readFile(new URL("app/api/auth/operator-password/route.ts", root), "utf8"),
    readFile(new URL("lib/operator-reauth.ts", root), "utf8"),
    readFile(new URL("components/operator-password-card.tsx", root), "utf8"),
    readFile(new URL("components/live-operator-console.tsx", root), "utf8"),
    readFile(new URL("components/login-form.tsx", root), "utf8"),
  ]);

  assert.match(route, /requireOperatorActor\(request\)/);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /user\.id !== operatorUserId/);
  assert.match(route, /consumeAuthenticationLimits/);
  assert.match(route, /verifyOperatorPassword\(operatorUserId, currentPassword\)/);
  assert.match(route, /updateUserById\(operatorUserId, \{ password: newPassword \}\)/);
  assert.match(route, /verifyOperatorPasswordAndRevokeSessions\(operatorUserId, newPassword\)/);
  assert.match(reauth, /signOut\(\{ scope: "global" \}\)/);
  assert.doesNotMatch(route + reauth, /localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(route, /console\./);
  assert.match(card, /autoComplete="current-password"/);
  assert.equal((card.match(/autoComplete="new-password"/g) ?? []).length, 2);
  assert.match(card, /aria-pressed=\{visible\}/);
  assert.doesNotMatch(card, /localStorage|sessionStorage|document\.cookie/);
  assert.match(consoleSource, /<OperatorPasswordCard \/>/);
  assert.equal((loginForm.match(/className="password-visibility-button"/g) ?? []).length, 3);
});

test("production provisioning is operator-authenticated, server-derived, and persisted", async () => {
  const [http, provisioning] = await Promise.all([
    readFile(new URL("lib/http.ts", root), "utf8"),
    readFile(new URL("app/api/provisioning/route.ts", root), "utf8"),
  ]);

  assert.match(http, /requireOperatorActor/);
  assert.match(http, /return operator\.auth_user_id/);
  assert.match(http, /Boolean\(await requireOperatorActor\(request\)\)/);
  assert.match(provisioning, /if \(isDemoRuntime\(\)\) return demoRegistryResponse\(\)/);
  assert.match(provisioning, /NEXT_PUBLIC_PLATFORM_DOMAIN/);
  assert.doesNotMatch(provisioning, /payload\.hostname/);
  assert.match(provisioning, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(provisioning, /admin\.rpc\("provision_organization_core"/);
  for (const parameter of [
    "p_operator_user_id",
    "p_template_version",
    "p_name",
    "p_slug",
    "p_hostname",
    "p_property_name",
    "p_primary_color",
    "p_accent_color",
    "p_idempotency_key_hash",
  ]) {
    assert.match(provisioning, new RegExp(`${parameter}:`));
  }
  assert.match(provisioning, /mode: "production"/);
  assert.match(provisioning, /persisted: true/);
  assert.match(provisioning, /CONTROL_CHARACTER_PATTERN\.test\(rawName\)/);
  assert.match(provisioning, /CONTROL_CHARACTER_PATTERN\.test\(rawPropertyName\)/);
  assert.match(provisioning, /error\.code === "22023"/);
  assert.match(provisioning, /error\.code === "P0001"/);
  assert.match(provisioning, /error\.code === "23505"/);
  for (const field of [
    "jobId",
    "organizationId",
    "organizationName",
    "organizationSlug",
    "propertyId",
    "propertyName",
    "hostname",
    "templateVersion",
    "state",
  ]) {
    assert.match(provisioning, new RegExp(`readString\\(result, "${field}"\\)`));
  }
  assert.doesNotMatch(provisioning, /\?\? (?:name|slug|propertyName)/);
  assert.match(provisioning, /templateVersion: persistedTemplateVersion/);
  assert.match(provisioning, /hostname: persistedHostname/);
  assert.match(provisioning, /idempotentReplay/);
});

test("empty draft deletion is reauthenticated, transactional, guarded, and user-confirmed", async () => {
  const [migration, ownerRestart, route, consoleSource] = await Promise.all([
    readFile(new URL("supabase/migrations/0012_delete_empty_draft_organization.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0013_allow_owner_only_draft_restart.sql", root), "utf8"),
    readFile(new URL("app/api/provisioning/route.ts", root), "utf8"),
    readFile(new URL("components/live-operator-console.tsx", root), "utf8"),
  ]);

  assert.match(migration, /create table public\.platform_audit_events/i);
  assert.match(migration, /alter table public\.platform_audit_events enable row level security/i);
  assert.match(migration, /organization\.state = 'draft'/i);
  assert.match(migration, /not organization\.demo_mode/i);
  assert.match(migration, /pg_catalog\.btrim\(p_confirmation_slug\) <> v_organization\.slug/i);
  for (const protectedTable of [
    "memberships",
    "rooms",
    "beds",
    "tenant_profiles",
    "occupancies",
    "invoices",
    "payments",
    "owner_password_recoveries",
  ]) {
    assert.match(migration, new RegExp(`from public\\.${protectedTable}`, "i"));
  }
  assert.match(migration, /from auth\.users/i);
  assert.match(migration, /invitation\.credential_state = 'activated'/i);
  assert.match(migration, /organization\.empty_draft_deleted/i);
  assert.match(migration, /delete from public\.staff_invitations[\s\S]*?delete from public\.audit_events[\s\S]*?delete from public\.provisioning_jobs[\s\S]*?delete from public\.properties[\s\S]*?delete from public\.organizations/i);
  assert.match(migration, /grant execute on function public\.delete_empty_draft_organization\(uuid, uuid, text\)[\s\S]*?to service_role/i);

  assert.match(ownerRestart, /v_membership_count > 1/i);
  assert.match(ownerRestart, /membership\.role <> 'owner' or membership\.state <> 'active'/i);
  assert.match(ownerRestart, /from storage\.objects/i);
  assert.match(ownerRestart, /other_membership\.organization_id <> p_organization_id/i);
  assert.match(ownerRestart, /from public\.platform_operators/i);
  assert.match(ownerRestart, /delete from public\.staff_invitations[\s\S]*?delete from public\.audit_events[\s\S]*?delete from auth\.users[\s\S]*?delete from public\.provisioning_jobs[\s\S]*?delete from public\.properties[\s\S]*?delete from public\.organizations/i);
  assert.match(ownerRestart, /'ownerAuthRemoved', v_owner_auth_user_id is not null/i);

  assert.match(route, /export async function DELETE\(request: Request\)/);
  assert.match(route, /requireOperatorActor\(request\)/);
  assert.match(route, /Object\.keys\(payload\)\.length !== 3/);
  assert.match(route, /consumeAuthenticationLimits\(request, requestHostname\(request\), user\.phone\)/);
  assert.match(route, /verifyOperatorPassword\(operatorUserId, operatorPassword\)/);
  assert.match(route, /admin\.rpc\("delete_empty_draft_organization"/);
  assert.doesNotMatch(route, /console\./);

  assert.match(consoleSource, /Delete draft/);
  assert.match(consoleSource, /deleteSlug !== deleteTarget\.slug/);
  assert.match(consoleSource, /autoComplete="current-password"/);
  assert.match(consoleSource, /Permanently delete draft/);
  assert.doesNotMatch(consoleSource, /localStorage|sessionStorage|document\.cookie/);
});

test("owner invitations store only short-lived hashes and remain server-only", async () => {
  const invitation = await readFile(
    new URL("supabase/migrations/0006_owner_invitations.sql", root),
    "utf8",
  );

  assert.match(invitation, /create table public\.staff_invitations/i);
  assert.match(invitation, /token_hash text not null unique/i);
  assert.match(invitation, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.doesNotMatch(invitation, /\braw_token\b|\bplaintext_token\b|\bp_token\b/i);
  assert.match(invitation, /phone ~ '\^\\\+91\[6-9\]\[0-9\]\{9\}\$'/i);
  assert.match(invitation, /expires_at >= created_at \+ interval '5 minutes'/i);
  assert.match(invitation, /expires_at <= created_at \+ interval '24 hours'/i);
  assert.match(invitation, /staff_invitations_state_consistency_check/i);
  assert.match(invitation, /staff_invitations_one_pending_owner_per_org_uq/i);
  assert.match(invitation, /where role = 'owner' and state = 'pending'/i);

  assert.match(invitation, /alter table public\.staff_invitations enable row level security/i);
  assert.match(
    invitation,
    /revoke all on public\.staff_invitations from public, anon, authenticated, service_role/i,
  );
  assert.match(invitation, /grant select on public\.staff_invitations to service_role/i);
  assert.doesNotMatch(invitation, /grant (?:insert|update|delete).*staff_invitations/i);

  assert.match(
    invitation,
    /create or replace function public\.create_owner_invitation\(\s*p_operator_user_id uuid,\s*p_organization_id uuid,\s*p_property_id uuid,\s*p_display_name text,\s*p_phone text,\s*p_token_hash text,\s*p_expires_at timestamptz\s*\)/i,
  );
  assert.match(invitation, /security definer\s+set search_path = pg_catalog, public/i);
  assert.match(invitation, /platform_operator\.state = 'active'/i);
  assert.match(invitation, /organization\.state = 'draft'/i);
  assert.match(invitation, /not organization\.demo_mode/i);
  assert.match(invitation, /property\.organization_id = p_organization_id/i);
  assert.match(invitation, /membership\.role = 'owner'/i);
  assert.match(invitation, /membership\.state in \('invited', 'active'\)/i);
  assert.match(invitation, /for update;/i);

  const revokeIndex = invitation.indexOf("update public.staff_invitations as invitation");
  const insertIndex = invitation.indexOf("insert into public.staff_invitations (");
  assert.ok(revokeIndex !== -1 && insertIndex !== -1 && revokeIndex < insertIndex);
  assert.match(invitation, /state = 'revoked'/i);
  assert.match(invitation, /returning invitation\.id into v_revoked_invitation_id/i);

  const auditStart = invitation.indexOf("insert into public.audit_events (");
  const persistedRead = invitation.indexOf("select\n    invitation.id", auditStart);
  assert.ok(auditStart !== -1 && persistedRead > auditStart);
  const auditSource = invitation.slice(auditStart, persistedRead);
  assert.doesNotMatch(auditSource, /token_hash|v_token_hash|p_token_hash/i);
  assert.match(auditSource, /owner_invitation\.created/i);

  for (const field of [
    "invitationId",
    "organizationId",
    "propertyId",
    "state",
    "displayName",
    "phone",
    "expiresAt",
  ]) {
    assert.match(invitation, new RegExp(`'${field}'`));
  }

  assert.doesNotMatch(invitation, /insert into auth\.users/i);
  assert.doesNotMatch(invitation, /insert into public\.memberships/i);
  assert.doesNotMatch(invitation, /update public\.provisioning_steps/i);
  assert.match(
    invitation,
    /grant execute on function public\.create_owner_invitation\([\s\S]*?\) to service_role/i,
  );
});

test("manual owner activation grants authority only after final Auth creation", async () => {
  const activation = await readFile(
    new URL("supabase/migrations/0007_manual_owner_activation.sql", root),
    "utf8",
  );

  for (const column of [
    "activation_auth_user_id",
    "activation_request_id",
    "auth_user_id",
    "credential_state",
    "credential_issued_at",
    "temporary_password_hash",
    "temporary_password_expires_at",
    "manual_phone_confirmed_at",
    "manual_phone_confirmed_by",
  ]) {
    assert.match(activation, new RegExp(`add column ${column}`, "i"));
  }

  assert.match(activation, /credential_state in \('not_issued', 'temporary', 'activated'\)/i);
  assert.match(activation, /temporary_password_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(
    activation,
    /temporary_password_expires_at <= credential_issued_at \+ interval '24 hours'/i,
  );
  assert.match(activation, /staff_invitations_manual_credential_consistency_check/i);
  assert.match(activation, /credential_state = 'not_issued'[\s\S]*?activation_auth_user_id is null[\s\S]*?activation_request_id is null/i);
  assert.match(activation, /credential_state = 'temporary'[\s\S]*?activation_auth_user_id is not null[\s\S]*?activation_request_id is null/i);
  assert.match(activation, /credential_state = 'activated'[\s\S]*?activation_request_id is not null[\s\S]*?activation_auth_user_id = auth_user_id/i);
  assert.match(activation, /staff_invitations_activation_auth_user_id_uq/i);
  assert.match(activation, /memberships_one_current_owner_per_org_uq/i);
  assert.doesNotMatch(activation, /owner.*auth_user.*uq|auth_user.*owner.*uq/i);

  assert.match(
    activation,
    /create or replace function public\.issue_manual_owner_credential\(\s*p_operator_user_id uuid,\s*p_invitation_id uuid,\s*p_temporary_password_hash text,\s*p_temporary_password_expires_at timestamptz\s*\)/i,
  );
  assert.match(
    activation,
    /create or replace function public\.reset_manual_owner_credential\(\s*p_operator_user_id uuid,\s*p_organization_id uuid,\s*p_expected_activation_auth_user_id uuid,\s*p_temporary_password_hash text,\s*p_temporary_password_expires_at timestamptz\s*\)/i,
  );
  assert.match(
    activation,
    /create or replace function public\.complete_manual_owner_activation\(\s*p_auth_user_id uuid,\s*p_organization_id uuid,\s*p_invitation_id uuid,\s*p_activation_request_id uuid\s*\)/i,
  );

  const issueStart = activation.indexOf("create or replace function public.issue_manual_owner_credential");
  const resetStart = activation.indexOf("create or replace function public.reset_manual_owner_credential");
  const completeStart = activation.indexOf("create or replace function public.complete_manual_owner_activation");
  const guardStart = activation.indexOf("create or replace function public.complete_manual_owner_activation_on_auth_user");
  const grantsStart = activation.indexOf("revoke all on function public.issue_manual_owner_credential");
  assert.ok(
    issueStart !== -1
      && resetStart > issueStart
      && completeStart > resetStart
      && guardStart > completeStart
      && grantsStart > guardStart,
  );

  const issueBody = activation.slice(issueStart, resetStart);
  const resetBody = activation.slice(resetStart, completeStart);
  const completeBody = activation.slice(completeStart, guardStart);
  const guardBody = activation.slice(guardStart, grantsStart);

  assert.doesNotMatch(issueBody, /insert into public\.memberships|(?:insert|update|delete)\s+(?:from\s+)?auth\.users/i);
  assert.doesNotMatch(resetBody, /insert into public\.memberships|(?:insert|update|delete)\s+(?:from\s+)?auth\.users/i);
  assert.match(issueBody, /activation_auth_user_id = (?:pg_catalog\.)?gen_random_uuid\(\)/i);
  assert.match(issueBody, /'activationAuthUserId', v_persisted\.activation_auth_user_id/i);
  assert.match(resetBody, /activation_auth_user_id = (?:pg_catalog\.)?gen_random_uuid\(\)/i);
  assert.match(resetBody, /invitation\.activation_auth_user_id = p_expected_activation_auth_user_id/i);
  assert.match(resetBody, /activation_request_id = null/i);
  assert.match(resetBody, /'activationAuthUserId', v_activation_auth_user_id/i);
  assert.match(completeBody, /insert into public\.memberships[\s\S]*?'owner',[\s\S]*?'active'/i);
  const membershipInsert = completeBody.slice(
    completeBody.indexOf("insert into public.memberships"),
    completeBody.indexOf("update public.staff_invitations"),
  );
  assert.doesNotMatch(membershipInsert, /'invited'/i);
  assert.doesNotMatch(activation, /\bp_temporary_password\b|\bp_final_password\b|\bencrypted_password\b/i);
  assert.doesNotMatch(activation, /insert into auth\.users|update auth\.users|delete from auth\.users/i);

  assert.match(activation, /organization\.state = 'draft'/i);
  assert.match(activation, /not organization\.demo_mode/i);
  assert.match(completeBody, /auth_user\.phone_confirmed_at is not null/i);
  assert.match(completeBody, /auth_user\.raw_app_meta_data @> pg_catalog\.jsonb_build_object/i);
  for (const label of [
    "pgflow_activation",
    "pgflow_invitation_id",
    "pgflow_organization_id",
    "pgflow_phone_confirmation",
    "pgflow_activation_request_id",
  ]) {
    assert.match(completeBody, new RegExp(`'${label}'`));
  }
  assert.match(completeBody, /temporary_password_expires_at <= v_now/i);
  assert.match(completeBody, /temporary_password_hash = null/i);
  assert.match(completeBody, /activation_request_id = p_activation_request_id/i);
  assert.match(completeBody, /and invitation\.activation_request_id is null/i);
  assert.match(completeBody, /'activationRequestId', p_activation_request_id/i);
  assert.match(completeBody, /provisioning_step\.key = 'owner_account'/i);
  assert.match(completeBody, /state = 'passed'/i);

  assert.match(
    guardBody,
    /if (?:pg_catalog\.)?coalesce\(new\.raw_app_meta_data ->> 'pgflow_activation', ''\) <> 'manual_owner' then\s+return new;/i,
  );
  assert.match(guardBody, /if new\.phone_confirmed_at is null then\s+return new;/i);
  assert.match(guardBody, /v_invitation\.activation_request_id = v_activation_request_id/i);
  assert.match(guardBody, /or v_invitation\.activation_request_id is not null/i);
  assert.match(
    guardBody,
    /perform public\.complete_manual_owner_activation\(\s*new\.id,\s*v_organization_id,\s*v_invitation_id,\s*v_activation_request_id\s*\)/i,
  );
  assert.match(
    activation,
    /create trigger auth_user_complete_manual_owner_activation\s+after insert or update of phone, phone_confirmed_at, raw_app_meta_data on auth\.users\s+for each row execute function public\.complete_manual_owner_activation_on_auth_user\(\)/i,
  );
  assert.match(
    activation,
    /revoke all on function public\.complete_manual_owner_activation_on_auth_user\(\)\s+from public, anon, authenticated, service_role/i,
  );

  assert.match(activation, /clear_staff_invitation_credential_on_close/i);
  assert.match(activation, /new\.state in \('revoked', 'expired'\)/i);
  assert.match(activation, /new\.temporary_password_hash := null/i);
  assert.match(activation, /new\.activation_auth_user_id := null/i);
  assert.match(activation, /new\.activation_request_id := null/i);
  assert.match(
    activation,
    /temporary_password_expires_at is\s+'Authoritative manual credential expiry after issue\/reset/i,
  );

  assert.doesNotMatch(activation, /'temporaryPasswordHash'|'temporary_password_hash'/i);
  for (const rpc of ["issue_manual_owner_credential", "reset_manual_owner_credential"]) {
    assert.match(
      activation,
      new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?\\) to service_role`, "i"),
    );
  }
  assert.doesNotMatch(
    activation,
    /grant execute on function public\.complete_manual_owner_activation\([\s\S]*?\) to service_role/i,
  );
  assert.match(
    activation,
    /revoke all on function public\.complete_manual_owner_activation\([\s\S]*?\) from public, anon, authenticated, service_role/i,
  );
});

test("manual owner Auth trigger validates NEW and canonical phone without a self-query", async () => {
  const correction = await readFile(
    new URL("supabase/migrations/0011_fix_manual_owner_auth_trigger_match.sql", root),
    "utf8",
  );

  assert.match(correction, /new\.id <> v_invitation\.activation_auth_user_id/i);
  assert.match(correction, /new\.phone_confirmed_at is null/i);
  assert.match(correction, /regexp_replace\([\s\S]*?new\.phone[\s\S]*?'\^\\\+'/i);
  assert.match(correction, /!~ '\^91\[6-9\]\[0-9\]\{9\}\$'/i);
  assert.match(correction, /new\.raw_app_meta_data @> pg_catalog\.jsonb_build_object/i);
  for (const label of [
    "pgflow_activation",
    "pgflow_invitation_id",
    "pgflow_organization_id",
    "pgflow_phone_confirmation",
    "pgflow_activation_request_id",
  ]) {
    assert.match(correction, new RegExp(`'${label}'`));
  }
  assert.match(correction, /v_invitation\.manual_phone_confirmed_at is null/i);
  assert.match(correction, /v_invitation\.manual_phone_confirmed_by is null/i);
  assert.match(correction, /refusing a partial migration/i);
  assert.match(
    correction,
    /revoke all on function public\.complete_manual_owner_activation_on_auth_user\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
});

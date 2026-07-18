import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isSameIndianPhone } from "../../lib/owner-invitations.ts";
import { isStrongOwnerPassword } from "../../lib/passwords.ts";

const root = new URL("../../", import.meta.url);

test("owner passwords enforce the approved first-login strength policy", () => {
  assert.equal(isStrongOwnerPassword("Short1!"), false);
  assert.equal(isStrongOwnerPassword("alllowercase1!"), false);
  assert.equal(isStrongOwnerPassword("ALLUPPERCASE1!"), false);
  assert.equal(isStrongOwnerPassword("NoNumberSymbol!"), false);
  assert.equal(isStrongOwnerPassword("No-Symbol-Number1"), true);
  assert.equal(isStrongOwnerPassword("Aa1!".padEnd(129, "x")), false);
});

test("activation recognizes Supabase's equivalent Indian phone representation", () => {
  assert.equal(isSameIndianPhone("+918002822133", "918002822133"), true);
  assert.equal(isSameIndianPhone("918002822133", "+918002822133"), true);
  assert.equal(isSameIndianPhone("+918002822133", "+918002822134"), false);
  assert.equal(isSameIndianPhone("8002822133", "+918002822133"), false);
  assert.equal(isSameIndianPhone("91 8002822133", "+918002822133"), false);
  assert.equal(isSameIndianPhone(undefined, "+918002822133"), false);
});

test("draft login distinguishes pending activation from an activated owner", async () => {
  const [loginPage, signIn, activation] = await Promise.all([
    readFile(new URL("app/login/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/sign-in/route.ts", root), "utf8"),
    readFile(new URL("lib/manual-owner-activation.ts", root), "utf8"),
  ]);

  assert.match(loginPage, /hasPendingManualOwnerCredential\(tenant\.organizationId\)/);
  assert.match(loginPage, /hasActivatedManualOwner\(tenant\.organizationId\)/);
  assert.match(loginPage, /workspaceSetupPending = !hasPendingOwner && !hasActivatedOwner/);
  assert.match(activation, /eq\("state", "pending"\)/);
  assert.match(activation, /eq\("credential_state", "temporary"\)/);
  assert.match(activation, /not\("temporary_password_hash", "is", null\)/);
  assert.match(activation, /gt\("temporary_password_expires_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(activation, /timingSafeEqual/);
  assert.match(activation, /eq\("state", "accepted"\)/);
  assert.match(activation, /eq\("credential_state", "activated"\)/);
  assert.match(activation, /invitation\.activation_auth_user_id !== authUserId/);
  assert.match(activation, /eq\("auth_user_id", authUserId\)/);
  assert.match(activation, /eq\("role", "owner"\)/);
  assert.match(activation, /eq\("state", "active"\)/);
  assert.match(signIn, /verifyPendingManualOwnerCredential/);
  assert.match(signIn, /nextStep: "create_private_password"/);
  assert.match(signIn, /requiresPasswordChange: true/);

  const draftStart = signIn.indexOf("if (isDraftOwnerActivation && tenantContext)");
  const normalAuthStart = signIn.indexOf("const supabase = await getSupabaseServerClient()", draftStart);
  assert.ok(draftStart !== -1 && normalAuthStart > draftStart);
  assert.match(signIn.slice(draftStart, normalAuthStart), /if \(credential\)/);
  assert.doesNotMatch(signIn.slice(draftStart, normalAuthStart), /createUser|set-cookie/i);
  assert.match(signIn, /canAccessTenantWorkspace\(tenantContext, membership\.role\)/);
});

test("manual owner activation never creates a temporary Auth session or browser-stored secret", async () => {
  const [route, loginForm, session, pageAuthorization] = await Promise.all([
    readFile(new URL("app/api/auth/change-password/route.ts", root), "utf8"),
    readFile(new URL("components/login-form.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/session/route.ts", root), "utf8"),
    readFile(new URL("lib/page-authorization.ts", root), "utf8"),
  ]);

  assert.match(route, /isTrustedMutationRequest\(request\)/);
  assert.match(route, /MAX_BODY_BYTES = 1024/);
  assert.match(route, /Object\.keys\(payload\)\.length !== 4/);
  for (const field of ["phone", "temporaryPassword", "newPassword", "activationRequestId"]) {
    assert.match(route, new RegExp(`Object\\.hasOwn\\(payload, "${field}"\\)`));
  }
  assert.match(route, /isUuid\(activationRequestId\)/);
  assert.match(route, /resolvePublicBrandContext\(request\)/);
  assert.match(route, /tenant\.state !== "draft"/);
  assert.match(route, /verifyPendingManualOwnerCredential/);
  assert.equal((route.match(/admin\.auth\.admin\.createUser\(authUserAttributes\)/g) ?? []).length, 2);
  assert.match(route, /let after = await reconcileActivation/);
  assert.match(route, /after\.kind === "pending" && retryableTransportFailure/);
  assert.match(route, /id: credential\.activationAuthUserId/);
  assert.match(route, /password: newPassword/);
  assert.match(route, /phone_confirm: true/);
  assert.match(route, /isSameIndianPhone\(user\.phone, credential\.phone\)/);
  assert.match(route, /pgflow_activation: "manual_owner"/);
  assert.match(route, /pgflow_phone_confirmation: "manual_operator"/);
  assert.match(route, /pgflow_activation_request_id: activationRequestId/);
  assert.match(
    route,
    /findCompletedRequest\(\s*admin,\s*tenant\.organizationId,\s*phone,\s*activationRequestId,\s*newPassword,\s*\)/,
  );
  assert.match(route, /reconcileActivation\(admin, credential, activationRequestId\)/);
  assert.match(route, /before\.kind === "committed_exact"/);
  assert.match(route, /before\.kind === "committed_other"/);
  assert.match(route, /after\.kind === "committed_exact"/);
  assert.match(route, /after\.kind === "committed_other"/);
  assert.doesNotMatch(
    route,
    /updateUserById|deleteUser|rpc\("complete_manual_owner_activation"|auth\.updateUser|console\./,
  );
  assert.match(route, /signInWithPassword\(\{\s*phone: credential\.phone,\s*password: newPassword,\s*\}\)/);
  assert.doesNotMatch(route, /signInWithPassword\([\s\S]{0,200}temporaryPassword/);
  assert.match(route, /persistSession: false/);
  assert.match(route, /signOut\(\{ scope: "local" \}\)/);
  assert.doesNotMatch(route, /error\?\.status === 422/);
  assert.doesNotMatch(route, /id:\s*(?:crypto\.)?randomUUID\(\)/);
  assert.doesNotMatch(route, /p_(?:auth_user_id|organization_id|invitation_id|activation_request_id):\s*(?:payload|body|parsed)/);

  assert.match(loginForm, /type ManualOwnerCredential = \{[\s\S]*?activationRequestId: string;[\s\S]*?\}/);
  assert.match(
    loginForm,
    /setManualCredential\(\{[\s\S]*?phone,[\s\S]*?temporaryPassword: password,[\s\S]*?activationRequestId: crypto\.randomUUID\(\),[\s\S]*?\}\)/,
  );
  assert.match(loginForm, /phone: manualCredential\.phone/);
  assert.match(loginForm, /temporaryPassword: manualCredential\.temporaryPassword/);
  assert.match(loginForm, /activationRequestId: manualCredential\.activationRequestId/);
  assert.equal((loginForm.match(/crypto\.randomUUID\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(
    loginForm,
    /sessionStorage|localStorage|document\.cookie|router\.replace\("\/change-password"\)|href="\/change-password"/,
  );
  assert.match(loginForm, /This PG workspace is still being prepared, so no dashboard is opened yet/);
  assert.doesNotMatch(session, /temporary|invitation|change-password/);
  assert.match(pageAuthorization, /eq\("state", "active"\)/);
});

test("legacy SMS OTP activation placeholders are removed", async () => {
  for (const path of [
    "app/activate/page.tsx",
    "components/owner-activation-card.tsx",
    "app/api/owner-activation/preview/route.ts",
  ]) {
    await assert.rejects(readFile(new URL(path, root), "utf8"));
  }

  const [login, invitationPanel, readme] = await Promise.all([
    readFile(new URL("app/login/page.tsx", root), "utf8"),
    readFile(new URL("components/owner-invitation-panel.tsx", root), "utf8"),
    readFile(new URL("README.md", root), "utf8"),
  ]);
  assert.doesNotMatch(login + invitationPanel + readme, /awaiting_sms_provider|SMS OTP delivery must be connected/i);
});

test("activation diagnostics accept only secret-free failure metadata", async () => {
  const source = await readFile(new URL("../../lib/activation-diagnostics.ts", import.meta.url), "utf8");
  assert.match(source, /import "server-only"/);
  for (const field of ["authErrorCode", "authErrorStatus", "reconciliationState", "requestBoundToStableId"]) {
    assert.match(source, new RegExp(field));
  }
  assert.doesNotMatch(source, /phone|password|credential|invitationId|organizationId|authUserId/i);
});

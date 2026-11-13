import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mustChangePassword, MUST_CHANGE_PASSWORD_FLAG } from "../../lib/password-change-flag.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("only an explicit true app_metadata flag requires a password change", () => {
  assert.equal(mustChangePassword({ app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: true } }), true);
  assert.equal(mustChangePassword({ app_metadata: { [MUST_CHANGE_PASSWORD_FLAG]: "true" } }), false);
  assert.equal(mustChangePassword({ app_metadata: {} }), false);
  assert.equal(mustChangePassword(null), false);
});

test("team changes are owner-only, re-authenticated, and never leave orphan logins", async () => {
  const route = await read("app/api/team/route.ts");
  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /verifyOwnerPassword\(user\.id, user\.phone, password\)/);
  assert.match(route, /consumeAuthenticationLimits/);
  assert.match(route, /\[MUST_CHANGE_PASSWORD_FLAG\]: true/);
  assert.match(route, /deleteUser\(created\.user\.id\)/);
  assert.doesNotMatch(route, /requireActor\(request, \[[^\]]*"manager"/);
});

test("accounts with a one-time password are confined to the password change", async () => {
  const [http, pages, update, signIn] = await Promise.all([
    read("lib/http.ts"),
    read("lib/page-authorization.ts"),
    read("app/api/auth/update-password/route.ts"),
    read("app/api/auth/sign-in/route.ts"),
  ]);
  assert.match(http, /mustChangePassword\(user\) && !options\.allowPendingPasswordChange\) return null/);
  assert.match(pages, /mustChangePassword\(user\) && !options\.allowPendingPasswordChange\) redirect\("\/account\/password"\)/);
  assert.match(update, /requireActor\(request, \["owner", "manager", "tenant"\], \{ allowPendingPasswordChange: true \}\)/);
  assert.match(update, /\[MUST_CHANGE_PASSWORD_FLAG\]: false/);
  assert.match(signIn, /redirectTo: passwordChangeRequired \? "\/account\/password"/);
});

test("manager RPCs check the owner in the database and respect read-only PGs", async () => {
  const migration = await read("supabase/migrations/0037_manager_accounts.sql");
  assert.match(migration, /role = 'owner'\s+and state = 'active'/);
  assert.match(migration, /organization_plan_status\(p_organization_id\) = 'expired'/);
  assert.match(migration, /revoke all on function public\.add_organization_manager[^;]*from public, anon, authenticated/);
});

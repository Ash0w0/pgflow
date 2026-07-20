import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

test("property structure migration is tenant-scoped, atomic, and audited", async () => {
  const [migration, lintFix] = await Promise.all([
    readFile(new URL("supabase/migrations/0014_property_inventory_setup.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/0015_fix_room_bed_loop_lint.sql", root), "utf8"),
  ]);

  assert.match(migration, /create table public\.floors/i);
  assert.match(migration, /foreign key \(organization_id, property_id\)[\s\S]*?references public\.properties/i);
  assert.match(migration, /create unique index floors_org_property_name_uq[\s\S]*?lower\(name\)/i);
  assert.match(migration, /alter table public\.floors enable row level security/i);
  assert.match(migration, /create policy floors_member_select/i);
  assert.match(migration, /revoke all on public\.floors from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete).*public\.floors/i);
  assert.match(migration, /add column floor_id uuid/i);
  assert.match(migration, /rooms_floor_property_fkey/i);
  assert.match(migration, /create or replace function public\.create_property_floor/i);
  assert.match(migration, /create or replace function public\.create_room_with_beds/i);
  assert.equal((migration.match(/security definer\s+set search_path = ''/gi) ?? []).length, 2);
  assert.equal((migration.match(/membership\.role = 'owner'/g) ?? []).length, 2);
  assert.equal((migration.match(/membership\.state = 'active'/g) ?? []).length, 2);
  assert.match(migration, /floor\.organization_id = p_organization_id/);
  assert.match(migration, /floor\.property_id = p_property_id/);
  assert.match(migration, /for v_index in 1\.\.p_capacity loop[\s\S]*?insert into public\.beds/i);
  assert.match(migration, /'floor\.created'/);
  assert.match(migration, /'room\.created_with_beds'/);
  assert.match(migration, /revoke all on function public\.create_property_floor[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.create_property_floor[\s\S]*?to service_role/i);
  assert.match(migration, /revoke all on function public\.create_room_with_beds[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.create_room_with_beds[\s\S]*?to service_role/i);
  assert.match(lintFix, /create or replace function public\.create_room_with_beds/i);
  assert.match(lintFix, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(lintFix, /v_bed_number integer/);
  assert.match(lintFix, /for v_bed_number in 1\.\.p_capacity loop[\s\S]*?insert into public\.beds/i);
  assert.match(lintFix, /membership\.role = 'owner'[\s\S]*?membership\.state = 'active'/i);
  assert.match(lintFix, /revoke all on function public\.create_room_with_beds[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(lintFix, /grant execute on function public\.create_room_with_beds[\s\S]*?to service_role/i);
});

test("property setup API derives tenancy from the authenticated owner", async () => {
  const route = await readFile(new URL("app/api/rooms/setup/route.ts", root), "utf8");

  assert.match(route, /isTrustedMutationRequest\(request\)/);
  assert.match(route, /MAX_BODY_BYTES = 2048/);
  assert.match(route, /requireActor\(request, \["owner"\]\)/);
  assert.match(route, /!actor \|\| !actor\.propertyId/);
  assert.match(route, /p_actor_user_id: actor\.id/);
  assert.match(route, /p_organization_id: actor\.organizationId/);
  assert.match(route, /p_property_id: actor\.propertyId/);
  assert.match(route, /admin\.rpc\("create_property_floor"/);
  assert.match(route, /admin\.rpc\("create_room_with_beds"/);
  assert.match(route, /Object\.keys\(body\)\.length !== 3/);
  assert.match(route, /Object\.keys\(body\)\.length !== 8/);
  assert.match(route, /body\.confirmBedCreation !== true/);
  assert.doesNotMatch(route, /body\.(?:organizationId|propertyId|actorId)/);
  assert.doesNotMatch(route, /\.from\("(?:floors|rooms|beds)"\)\.(?:insert|update|delete)/);
});

test("rooms page is an owner-authorized live setup surface", async () => {
  const [page, workspace, dataService] = await Promise.all([
    readFile(new URL("app/rooms/page.tsx", root), "utf8"),
    readFile(new URL("components/room-setup-workspace.tsx", root), "utf8"),
    readFile(new URL("lib/room-setup.ts", root), "utf8"),
  ]);

  assert.match(page, /requireStaffPage\(\["owner"\]\)/);
  assert.match(page, /getRoomSetupData\(authorization\.actor\.organizationId, authorization\.actor\.propertyId\)/);
  assert.match(dataService, /import "server-only"/);
  for (const table of ["floors", "rooms", "beds"]) {
    assert.match(dataService, new RegExp(`from\\("${table}"\\)[\\s\\S]*?eq\\("organization_id", organizationId\\)[\\s\\S]*?eq\\("property_id", propertyId\\)`));
  }
  assert.match(workspace, /fetch\("\/api\/rooms\/setup"/);
  assert.match(workspace, /action: "create_floor"/);
  assert.match(workspace, /action: "create_room"/);
  assert.match(workspace, /confirmBedCreation: true/);
  assert.match(workspace, /router\.refresh\(\)/);
});

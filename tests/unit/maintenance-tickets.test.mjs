import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getCategoryLabel,
  getNextStatus,
} from "../../lib/maintenance-tickets.ts";

const root = new URL("../../", import.meta.url);

test("formats category labels with standard emojis", () => {
  assert.equal(getCategoryLabel("wifi"), "📶 Wi-Fi & Internet");
  assert.equal(getCategoryLabel("plumbing"), "🚰 Plumbing & Water");
  assert.equal(getCategoryLabel("electrical"), "⚡ Electrical & Lighting");
  assert.equal(getCategoryLabel("cleaning"), "🧹 Cleaning & Housekeeping");
  assert.equal(getCategoryLabel("food"), "🍲 Mess & Food");
  assert.equal(getCategoryLabel("other"), "🔧 General Repair");
});

test("transitions ticket status sequentially", () => {
  assert.equal(getNextStatus("open"), "in_progress");
  assert.equal(getNextStatus("in_progress"), "resolved");
  assert.equal(getNextStatus("resolved"), "closed");
  assert.equal(getNextStatus("closed"), "open");
});

test("verifies 0027 maintenance tickets migration security contract", async () => {
  const rawMigration = await readFile(
    new URL("supabase/migrations/0027_maintenance_tickets.sql", root),
    "utf8"
  );
  const migration = rawMigration.replace(/\r\n/g, "\n");

  assert.match(migration, /create table if not exists public\.maintenance_tickets/i);
  assert.match(migration, /category text not null check/i);
  assert.match(migration, /status text not null default 'open'/i);
  assert.match(migration, /alter table public\.maintenance_tickets enable row level security/i);
  assert.match(migration, /grant select on public\.maintenance_tickets to service_role/i);
  assert.match(
    migration,
    /create or replace function public\.create_maintenance_ticket/i
  );
  assert.match(
    migration,
    /create or replace function public\.update_maintenance_ticket_status/i
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /maintenance_ticket\.created/i);
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

test("the health check expects the newest database update", async () => {
  const files = (await readdir(new URL("../../supabase/migrations/", import.meta.url))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const newest = files.at(-1).slice(0, 4);
  const health = await readFile(new URL("../../app/api/health/route.ts", import.meta.url), "utf8");
  assert.match(health, new RegExp(`EXPECTED_SCHEMA_VERSION = "${newest}"`), `bump EXPECTED_SCHEMA_VERSION in app/api/health/route.ts to ${newest}`);
});

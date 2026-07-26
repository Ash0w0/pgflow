import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createCanonicalDemoSeed } from "../../demo/seed.ts";
import { isDemoHostname, resolveDemoBrand } from "../../demo/branding.ts";
import { provisionedProperties } from "../../demo/data.ts";

test("keeps canonical fixtures inside the demo boundary", () => {
  const seed = createCanonicalDemoSeed();
  assert.equal(seed.floors.length, 3);
  assert.equal(seed.rooms.length, 24);
  assert.equal(seed.beds.length, 60);
  assert.equal(seed.tenants.length, 48);
  assert.equal(new Set(seed.tenants.map((tenant) => tenant.bedId)).size, 48);
});

test("accepts only the dedicated demo host and safe preview hosts", () => {
  assert.equal(resolveDemoBrand("demo.pgflow.co").shortName, "PGFlow");
  assert.equal(resolveDemoBrand("iris.pgflow.app"), null);
  assert.equal(resolveDemoBrand("metronest.pgflow.app"), null);
  assert.equal(isDemoHostname("pgflow.co"), false);
  assert.equal(isDemoHostname("preview.vercel.app"), true);
  assert.ok(provisionedProperties.every((property) => property.domain === "demo.pgflow.co"));
});

test("production modules contain no static demo fixture imports", async () => {
  const paths = [
    "../../app/page.tsx",
    "../../app/operator/page.tsx",
    "../../app/collections/page.tsx",
    "../../app/operations/page.tsx",
    "../../app/reports/page.tsx",
    "../../app/tenant/page.tsx",
    "../../lib/branding.ts",
    "../../lib/maintenance-ticket-data.ts",
    "../../lib/template.ts",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /^import .*['"]@\/demo\//m);
    assert.doesNotMatch(source, /from ['"]\.\/demo-data['"]/);
  }
});

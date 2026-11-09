import test from "node:test";
import assert from "node:assert/strict";
import { GET as remindersCron } from "../../app/api/cron/whatsapp-reminders/route.ts";
import { GET as digestCron } from "../../app/api/cron/daily-digest/route.ts";

test("executes automated WhatsApp payment reminders cron in demo mode", async () => {
  process.env.PGFLOW_RUNTIME = "demo";

  const req = new Request("http://localhost:3001/api/cron/whatsapp-reminders", { method: "GET" });
  const res = await remindersCron(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.processedCount, 2);
  assert.equal(json.results[0].resident, "Mira Kapoor");
  assert.equal(json.results[0].stage, "T-3");
});

test("executes 8:00 PM daily owner digest cron in demo mode", async () => {
  process.env.PGFLOW_RUNTIME = "demo";

  const req = new Request("http://localhost:3001/api/cron/daily-digest", { method: "GET" });
  const res = await digestCron(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.digest.ownerName, "Rohan Sharma");
  assert.match(json.previewText, /PGFlow Daily Digest for Rohan Sharma/);
});

const CRON_SECRET = "test-cron-secret-0123456789abcdef-xyz";

async function inProduction(env, run) {
  const keys = ["PGFLOW_RUNTIME", "CRON_SECRET"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.PGFLOW_RUNTIME = "supabase";
  if (env.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = env.CRON_SECRET;
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

for (const [name, handler, path] of [["reminders", remindersCron, "whatsapp-reminders"], ["digest", digestCron, "daily-digest"]]) {
  test(`${name} cron refuses every request when CRON_SECRET is not configured`, () => inProduction({ CRON_SECRET: undefined }, async () => {
    const res = await handler(new Request(`http://localhost/api/cron/${path}`, { headers: { authorization: "Bearer pgflow_cron_secret" } }));
    assert.equal(res.status, 503);
  }));

  test(`${name} cron refuses a too-short CRON_SECRET configuration`, () => inProduction({ CRON_SECRET: "short" }, async () => {
    const res = await handler(new Request(`http://localhost/api/cron/${path}`, { headers: { authorization: "Bearer short" } }));
    assert.equal(res.status, 503);
  }));

  test(`${name} cron rejects the formerly hardcoded and wrong secrets`, () => inProduction({ CRON_SECRET }, async () => {
    for (const authorization of ["Bearer pgflow_cron_secret", `Bearer ${CRON_SECRET}x`, CRON_SECRET, ""]) {
      const res = await handler(new Request(`http://localhost/api/cron/${path}`, { headers: { authorization } }));
      assert.equal(res.status, 401, authorization);
    }
  }));
}

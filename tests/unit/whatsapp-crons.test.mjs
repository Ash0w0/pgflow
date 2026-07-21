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

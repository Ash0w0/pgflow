import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);

test("webhook verifies the raw Meta signature and has no default token", async () => {
  const [route, http] = await Promise.all([
    readFile(new URL("app/api/webhooks/whatsapp/route.ts", root), "utf8"),
    readFile(new URL("lib/http.ts", root), "utf8"),
  ]);
  assert.match(route, /request\.text\(\)/);
  assert.match(route, /x-hub-signature-256/i);
  assert.match(route, /verifyMetaSignature/);
  assert.doesNotMatch(route, /pgflow_webhook_verify_token|pgflow_wh_verify_secret/);
  assert.match(http, /HMAC/);
  assert.match(http, /SHA-256/);
});

test("webhook persists every entry/change slice idempotently before returning success", async () => {
  const route = await readFile(new URL("app/api/webhooks/whatsapp/route.ts", root), "utf8");
  assert.match(route, /for \(const \[entryIndex, entry\] of \(body\.entry \?\? \[\]\)\.entries\(\)\)/);
  assert.match(route, /for \(const \[changeIndex, change\] of \(entry\.changes \?\? \[\]\)\.entries\(\)\)/);
  assert.match(route, /status:\$\{status\.id\}:\$\{status\.status\}:\$\{status\.timestamp\}/);
  assert.match(route, /onConflict: "provider_event_key", ignoreDuplicates: true/);
  assert.match(route, /whatsapp_webhook_events/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("production delivery fails closed and classifies uncertain sends without blind retry", async () => {
  const [client, config, outbox] = await Promise.all([
    read("lib/whatsapp/client.ts"),
    read("lib/whatsapp/config.ts"),
    read("lib/whatsapp/outbox-worker.ts"),
  ]);
  assert.match(config, /runtime === "production" && sendMode !== "disabled"/);
  assert.match(config, /required\("WHATSAPP_ACCESS_TOKEN"\)/);
  assert.doesNotMatch(client, /!process\.env\.WHATSAPP_TOKEN/);
  assert.match(client, /outcome: "delivery_uncertain"/);
  assert.match(client, /res\.status === 429 \|\| res\.status >= 500/);
  assert.match(outbox, /finish\(job, workerId, "delivery_uncertain"/);
  assert.doesNotMatch(outbox, /delivery_uncertain[\s\S]{0,120}retry_wait/);
});

test("consent, templates and two-step financial actions are enforced server-side", async () => {
  const [worker, ownerSql, activation, templates] = await Promise.all([
    read("lib/whatsapp/webhook-worker.ts"),
    read("supabase/migrations/0036_whatsapp_owner_actions.sql"),
    read("app/api/operator/whatsapp/activation/route.ts"),
    read("lib/whatsapp/outbox-worker.ts"),
  ]);
  for (const command of ["STOP", "UNSUBSCRIBE", "START", "YES", "LANGUAGE"]) {
    assert.match(worker, new RegExp(command));
  }
  assert.match(activation, /token_hash: tokenHash/);
  assert.doesNotMatch(activation, /token_hash: token[,}]/);
  assert.match(templates, /approval_state", "approved"/);
  assert.match(ownerSql, /context_wamid = p_context_wamid/);
  assert.match(ownerSql, /phone_e164 = p_sender_phone/);
  assert.match(ownerSql, /role in \('owner', 'accountant'\)/);
  assert.match(ownerSql, /state = 'pending_review'/);
  assert.match(ownerSql, /for update/);
});

test("webhook media is private, scoped, validated and never auto-approved", async () => {
  const [media, migration, worker] = await Promise.all([
    read("lib/whatsapp/media.ts"),
    read("supabase/migrations/0038_private_whatsapp_media.sql"),
    read("lib/whatsapp/webhook-worker.ts"),
  ]);
  assert.match(migration, /'whatsapp-inbound'[\s\S]*false/);
  assert.match(media, /image\/jpeg/);
  assert.match(media, /8 \* 1024 \* 1024/);
  assert.match(media, /organizations\/\$\{organizationId\}\/whatsapp-inbound/);
  assert.match(media, /createHash\("sha256"\)/);
  assert.doesNotMatch(worker, /auto.?approve/i);
});

test("CI and package manager are pinned and cover production, demo, rehearsals and database tests", async () => {
  const [ci, pkg, nvmrc] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read("package.json"),
    read(".nvmrc"),
  ]);
  assert.match(pkg, /"packageManager": "pnpm@10\.28\.0"/);
  assert.match(pkg, /"node": "22\.x"/);
  assert.equal(nvmrc.trim(), "22.13.0");
  assert.match(ci, /pnpm install --frozen-lockfile/);
  assert.match(ci, /npm install --global corepack@0\.34\.4/);
  assert.match(ci, /pnpm run demo:build/);
  assert.match(ci, /pnpm run test:rehearsals/);
  assert.match(ci, /version: 2\.101\.0/);
  assert.match(ci, /supabase test db/);
  const dependencyInstallLines = ci.split("\n")
    .filter((line) => /\bnpm install\b/.test(line))
    .filter((line) => !/npm install --global corepack@0\.34\.4/.test(line));
  assert.deepEqual(dependencyInstallLines, []);
  assert.doesNotMatch(ci, /npm audit fix|version: latest/);
});

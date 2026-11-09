import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { GET, POST } from "../../app/api/webhooks/whatsapp/route.ts";

const VERIFY_TOKEN = "test-verify-token-0123456789abcdef-xyz";
const APP_SECRET = "test-app-secret-0123456789abcdef";
const WEBHOOK_URL = "http://localhost:3001/api/webhooks/whatsapp";

function sign(body, secret = APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("verifies Meta webhook subscribe challenge with the configured verify token", () => withEnv({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN }, async () => {
  const url = `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=CHALLENGE_12345`;
  const req = new Request(url, { method: "GET" });

  const res = await GET(req);
  assert.equal(res.status, 200);

  const text = await res.text();
  assert.equal(text, "CHALLENGE_12345");
}));

test("rejects tokens that were previously hardcoded in source", () => withEnv({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN }, async () => {
  for (const token of ["pgflow_webhook_verify_token", "pgflow_wh_verify_secret_2026"]) {
    const res = await GET(new Request(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=X`));
    assert.equal(res.status, 403);
  }
}));

test("refuses webhook verification when no verify token is configured", () => withEnv({ WHATSAPP_VERIFY_TOKEN: undefined }, async () => {
  const res = await GET(new Request(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=X`));
  assert.equal(res.status, 503);
}));

test("refuses a too-short or placeholder verify token configuration", () => withEnv({ WHATSAPP_VERIFY_TOKEN: "replace_me" }, async () => {
  const res = await GET(new Request(`${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=replace_me&hub.challenge=X`));
  assert.equal(res.status, 503);
}));

test("production webhook rejects unsigned events", () => withEnv({ PGFLOW_RUNTIME: "supabase", WHATSAPP_APP_SECRET: APP_SECRET }, async () => {
  const body = JSON.stringify({ entry: [] });
  const res = await POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body }));
  assert.equal(res.status, 401);
}));

test("production webhook rejects events signed with the wrong secret", () => withEnv({ PGFLOW_RUNTIME: "supabase", WHATSAPP_APP_SECRET: APP_SECRET }, async () => {
  const body = JSON.stringify({ entry: [] });
  const res = await POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "x-hub-signature-256": sign(body, "attacker-secret") }, body }));
  assert.equal(res.status, 401);
}));

test("production webhook rejects a valid signature over a different body", () => withEnv({ PGFLOW_RUNTIME: "supabase", WHATSAPP_APP_SECRET: APP_SECRET }, async () => {
  const signed = JSON.stringify({ entry: [] });
  const tampered = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.X", recipient_id: "919812345678", status: "read" }] } }] }] });
  const res = await POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "x-hub-signature-256": sign(signed) }, body: tampered }));
  assert.equal(res.status, 401);
}));

test("production webhook fails closed when the app secret is not configured", () => withEnv({ PGFLOW_RUNTIME: "supabase", WHATSAPP_APP_SECRET: undefined }, async () => {
  const body = JSON.stringify({ entry: [] });
  const res = await POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "x-hub-signature-256": sign(body) }, body }));
  assert.equal(res.status, 503);
}));

test("production webhook accepts a correctly signed event", () => withEnv({ PGFLOW_RUNTIME: "supabase", WHATSAPP_APP_SECRET: APP_SECRET }, async () => {
  const body = JSON.stringify({ entry: [] });
  const res = await POST(new Request(WEBHOOK_URL, { method: "POST", headers: { "x-hub-signature-256": sign(body) }, body }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
}));

test("rejects Meta webhook verification with invalid verify token", () => withEnv({ WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN }, async () => {
  const url = "http://localhost:3001/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=CHALLENGE_12345";
  const req = new Request(url, { method: "GET" });

  const res = await GET(req);
  assert.equal(res.status, 403);
}));

test("ingests incoming WhatsApp payment proof image webhook in demo mode", async () => {
  process.env.PGFLOW_RUNTIME = "demo";

  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "9876543210",
                  id: "wamid.HBgL1234567890",
                  type: "image",
                  image: {
                    id: "media_img_9988",
                    caption: "Paid ₹8,500 via PhonePe",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const req = new Request("http://localhost:3001/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.ingested, true);
  assert.equal(json.mediaId, "media_img_9988");
  assert.equal(json.senderPhone, "919876543210");
});

import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../../app/api/webhooks/whatsapp/route.ts";

test("verifies Meta webhook subscribe challenge with valid verify token", async () => {
  const url = "http://localhost:3001/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=pgflow_webhook_verify_token&hub.challenge=CHALLENGE_12345";
  const req = new Request(url, { method: "GET" });

  const res = await GET(req);
  assert.equal(res.status, 200);

  const text = await res.text();
  assert.equal(text, "CHALLENGE_12345");
});

test("rejects Meta webhook verification with invalid verify token", async () => {
  const url = "http://localhost:3001/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=CHALLENGE_12345";
  const req = new Request(url, { method: "GET" });

  const res = await GET(req);
  assert.equal(res.status, 403);
});

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

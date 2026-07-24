import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("renders every principal product surface", async () => {
  const routes = new Map([
    ["/", /Good morning, Aarav/],
    ["/tenant", /Hi, Mira/],
    ["/operator", /Fictional operator UI preview/],
    ["/presentation", /Run your PG from WhatsApp/],
    ["/collections", /Sample register/],
    ["/pay/INV-DEMO-0726", /Demo safety is active/],
  ]);
  for (const [path, expected] of routes) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.match(html, expected, path);
    assert.doesNotMatch(html, /upi:\/\/pay/i, path);
  }
});

test("applies baseline response security headers", async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});

test("rejects unauthenticated payment evidence", async () => {
  const response = await fetch(`${baseUrl}/api/payments/evidence`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId: "forged", invoiceId: "INV", amount: 1, utr: "DEMO12345678", paidAt: "2026-07-17", fileHash: "a".repeat(64) }),
  });
  assert.equal(response.status, 401);
});

test("provisioning preview is deterministic for one idempotency key", async () => {
  const body = JSON.stringify({ name: "Aster House", slug: "aster-house", ownerPhone: "+919999999999", idempotencyKey: "aster-001" });
  const request = () => fetch(`${baseUrl}/api/provisioning`, {
    method: "POST",
    headers: { authorization: "Bearer demo-operator", "content-type": "application/json" },
    body,
  });
  const firstResponse = await request();
  const secondResponse = await request();
  assert.equal(firstResponse.status, 202);
  assert.equal(secondResponse.status, 202);
  const first = await firstResponse.json();
  const second = await secondResponse.json();
  assert.equal(first.job.id, second.job.id);
  assert.equal(first.job.persisted, false);
});

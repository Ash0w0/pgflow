import assert from "node:assert/strict";
import test from "node:test";
import { matchesImageSignature } from "../../lib/image-signature.ts";
import { safeDbMessage } from "../../lib/safe-db-error.ts";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), 0]);
const text = new Uint8Array(Buffer.from("not really a png, just text"));

test("payment screenshots must really be the image type they claim", () => {
  assert.equal(matchesImageSignature(png, "image/png"), true);
  assert.equal(matchesImageSignature(jpeg, "image/jpeg"), true);
  assert.equal(matchesImageSignature(webp, "image/webp"), true);
  assert.equal(matchesImageSignature(text, "image/png"), false);
  assert.equal(matchesImageSignature(png, "image/jpeg"), false);
  assert.equal(matchesImageSignature(png, "application/pdf"), false);
  assert.equal(matchesImageSignature(new Uint8Array(), "image/png"), false);
});

test("database internals never reach the browser, business messages do", () => {
  const fallback = "Please try again.";
  assert.equal(safeDbMessage({ message: 'new row for relation "maintenance_tickets" violates check constraint "x"' }, fallback), fallback);
  assert.equal(safeDbMessage({ message: 'column "plan" does not exist' }, fallback), fallback);
  assert.equal(safeDbMessage({ message: "permission denied for table payments" }, fallback), fallback);
  assert.equal(safeDbMessage({ message: "" }, fallback), fallback);
  assert.equal(safeDbMessage(null, fallback), fallback);
  assert.equal(safeDbMessage({ message: "x".repeat(400) }, fallback), fallback);
  assert.equal(
    safeDbMessage({ message: "Your PGFlow free trial has ended, so this workspace is read-only." }, fallback),
    "Your PGFlow free trial has ended, so this workspace is read-only.",
  );
});

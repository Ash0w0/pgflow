import test from "node:test";
import assert from "node:assert/strict";
import {
  formatReceiptNumber,
  generateReceiptHtml,
} from "../../lib/receipt-generator.ts";

test("formats sequential receipt numbers correctly", () => {
  const receiptNum = formatReceiptNumber("pay-9876-4829", "2026-07-21");
  assert.equal(receiptNum, "REC-2026-07-4829");
});

test("generates printable HTML rent receipt with all required fields", () => {
  const html = generateReceiptHtml({
    receiptNumber: "REC-2026-07-0018",
    pgName: "PGFlow Sample",
    pgAddress: "14/2 Indiranagar, Bengaluru",
    pgContact: "+91 98765 43210",
    residentName: "Mira Kapoor",
    roomNumber: "A-204",
    bedNumber: "2",
    paymentDate: "2026-07-19",
    billingPeriod: "July 2026",
    paymentMethod: "UPI",
    referenceNumber: "DEMO48291073",
    amountPaid: 8500,
    issuedBy: "Front Desk Manager",
  });

  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /PGFlow Sample/);
  assert.match(html, /REC-2026-07-0018/);
  assert.match(html, /Mira Kapoor/);
  assert.match(html, /Room A-204/);
  assert.match(html, /DEMO48291073/);
  assert.match(html, /₹8,500\.00/);
  assert.match(html, /Print \/ Save PDF/);
});

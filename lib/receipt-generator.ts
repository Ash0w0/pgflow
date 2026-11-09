/**
 * Branded rent receipt generator for PGFlow.
 * Builds structured receipt data and printable HTML markup.
 */

export interface ReceiptData {
  receiptNumber: string;
  pgName: string;
  pgAddress?: string;
  pgContact?: string;
  residentName: string;
  roomNumber: string;
  bedNumber?: string;
  paymentDate: string;
  billingPeriod: string;
  paymentMethod: "UPI" | "Cash";
  referenceNumber: string;
  amountPaid: number;
  issuedBy: string;
  notes?: string;
}

export function formatReceiptNumber(id: string, dateIso: string): string {
  const date = new Date(dateIso);
  const year = isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();
  const month = isNaN(date.getTime())
    ? String(new Date().getUTCMonth() + 1).padStart(2, "0")
    : String(date.getUTCMonth() + 1).padStart(2, "0");
  const cleanId = id.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase();
  return `REC-${year}-${month}-${cleanId || "0001"}`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text before it is interpolated into receipt markup. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

export function generateReceiptHtml(input: ReceiptData): string {
  const data = {
    ...input,
    receiptNumber: escapeHtml(input.receiptNumber),
    pgName: escapeHtml(input.pgName),
    pgAddress: input.pgAddress ? escapeHtml(input.pgAddress) : "",
    pgContact: input.pgContact ? escapeHtml(input.pgContact) : "",
    residentName: escapeHtml(input.residentName),
    roomNumber: escapeHtml(input.roomNumber),
    bedNumber: input.bedNumber ? escapeHtml(input.bedNumber) : "",
    paymentDate: escapeHtml(input.paymentDate),
    billingPeriod: escapeHtml(input.billingPeriod),
    paymentMethod: escapeHtml(input.paymentMethod),
    referenceNumber: escapeHtml(input.referenceNumber),
    issuedBy: escapeHtml(input.issuedBy),
    notes: input.notes ? escapeHtml(input.notes) : "",
  };
  const formattedAmount = data.amountPaid.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${data.receiptNumber} - ${data.pgName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      padding: 2rem;
      display: flex;
      justify-content: center;
    }
    .receipt-card {
      background: #ffffff;
      width: 100%;
      max-width: 650px;
      border: 1px solid #e2e8f0;
      border-radius: 1rem;
      padding: 2.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
      position: relative;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .brand-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.025em;
    }
    .brand-subtitle {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: 0.25rem;
    }
    .receipt-badge {
      text-align: right;
    }
    .badge-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #d97706;
      background: #fef3c7;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      display: inline-block;
      margin-bottom: 0.5rem;
    }
    .receipt-num {
      font-size: 0.875rem;
      font-weight: 700;
      color: #334155;
      font-mono: monospace;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
      margin-bottom: 1.5rem;
    }
    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 0.25rem;
    }
    .field-value {
      font-size: 0.95rem;
      font-weight: 600;
      color: #0f172a;
    }
    .amount-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.75rem;
      padding: 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .amount-title {
      font-size: 0.875rem;
      font-weight: 700;
      color: #334155;
    }
    .amount-value {
      font-size: 1.75rem;
      font-weight: 900;
      color: #059669;
    }
    .footer {
      border-top: 1px solid #f1f5f9;
      padding-top: 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .print-btn {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #d97706;
      color: #ffffff;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 9999px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 15px -3px rgba(217, 119, 6, 0.4);
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt-card { border: none; box-shadow: none; max-width: 100%; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt-card">
    <div class="header">
      <div>
        <div class="brand-title">${data.pgName}</div>
        <div class="brand-subtitle">${data.pgAddress || "Verified Paying Guest Accommodation"}</div>
        ${data.pgContact ? `<div class="brand-subtitle">Contact: ${data.pgContact}</div>` : ""}
      </div>
      <div class="receipt-badge">
        <div class="badge-label">Official Receipt</div>
        <div class="receipt-num">${data.receiptNumber}</div>
      </div>
    </div>

    <div class="grid">
      <div>
        <div class="field-label">Received From</div>
        <div class="field-value">${data.residentName}</div>
      </div>
      <div>
        <div class="field-label">Room / Bed</div>
        <div class="field-value">Room ${data.roomNumber}${data.bedNumber ? ` (Bed ${data.bedNumber})` : ""}</div>
      </div>
      <div>
        <div class="field-label">Payment Date</div>
        <div class="field-value">${data.paymentDate}</div>
      </div>
      <div>
        <div class="field-label">Billing Cycle</div>
        <div class="field-value">${data.billingPeriod}</div>
      </div>
      <div>
        <div class="field-label">Payment Method</div>
        <div class="field-value">${data.paymentMethod}</div>
      </div>
      <div>
        <div class="field-label">UTR / Ref No</div>
        <div class="field-value">${data.referenceNumber}</div>
      </div>
    </div>

    <div class="amount-box">
      <div class="amount-title">Total Amount Paid</div>
      <div class="amount-value">₹${formattedAmount}</div>
    </div>

    <div class="footer">
      <div>Issued by: ${data.issuedBy}</div>
      <div>PGFlow Verified Ledger Entry</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body>
</html>`;
}

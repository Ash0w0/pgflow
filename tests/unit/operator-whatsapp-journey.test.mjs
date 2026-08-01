import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getWeeklyReportWindow } from "../../lib/whatsapp/weekly-report-window.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("operator activation directory exposes eligible contacts without exposing raw phone numbers", async () => {
  const route = await read("app/api/operator/whatsapp/activation/route.ts");
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.match(route, /requireOperator\(request\)/);
  assert.match(route, /\.in\("state", \["active", "notice"\]\)/);
  assert.match(route, /\["draft", "core_ready", "integrations_pending", "live"\]/);
  assert.match(route, /\.in\("role", \["owner", "accountant"\]\)\.eq\("state", "active"\)/);
  assert.match(route, /maskedPhone: maskPhone\(membership\.phone\)/);
  assert.match(route, /maskedPhone: maskPhone\(resident\.phone\)/);
  assert.doesNotMatch(route, /maskedPhone:\s*(?:membership|resident)\.phone/);
});

test("operator activation control creates a one-time link with copy, QR, and WhatsApp actions", async () => {
  const panel = await read("components/whatsapp-journey-operator-panel.tsx");
  assert.match(panel, /fetch\("\/api\/operator\/whatsapp\/activation"/);
  assert.match(panel, /QRCode\.toDataURL\(activation\.qrValue/);
  assert.match(panel, /navigator\.clipboard\.writeText\(activation\.activationUrl\)/);
  assert.match(panel, /href=\{activation\.activationUrl\}/);
  assert.match(panel, /Create one-time activation link/);
});

test("weekly report operator endpoint requires a preview-safe explicit confirmation and only enqueues", async () => {
  const [route, report] = await Promise.all([
    read("app/api/operator/whatsapp/weekly-report/route.ts"),
    read("lib/whatsapp/operator-weekly-report.ts"),
  ]);
  assert.match(route, /const CONFIRMATION = "queue_weekly_report"/);
  assert.match(route, /body\.confirmation !== CONFIRMATION/);
  assert.match(route, /if \(!preview\.ready \|\| !queueContext\)/);
  assert.match(route, /status: 202/);
  assert.doesNotMatch(route, /sendWhatsApp|graph\.facebook|fetch\(/);
  assert.match(report, /p_dedupe_key: `weekly:\$\{context\.ownerMembershipId\}:\$\{context\.weekStart\}`/);
  assert.match(report, /\.eq\("approval_state", "approved"\)/);
  assert.match(report, /contact\.consent_state !== "opted_in"/);
  assert.match(report, /!contact\.weekly_report_enabled/);
  assert.match(report, /getWhatsAppSendMode\(\) === "disabled"/);
});

test("weekly report delivery window blocks incomplete and expired reports", () => {
  const incomplete = getWeeklyReportWindow(
    "2026-07-20",
    new Date("2026-07-26T12:00:00+05:30"),
  );
  assert.equal(incomplete.weekEnd, "2026-07-27");
  assert.match(incomplete.blockers.join(" "), /still in progress/);

  const readyWindow = getWeeklyReportWindow(
    "2026-07-20",
    new Date("2026-07-27T09:00:00+05:30"),
  );
  assert.deepEqual(readyWindow.blockers, []);

  const expired = getWeeklyReportWindow(
    "2026-07-20",
    new Date("2026-07-28T12:01:00+05:30"),
  );
  assert.match(expired.blockers.join(" "), /past its delivery window/);
});

test("weekly report UI cannot queue before the preview is ready and confirmed", async () => {
  const panel = await read("components/whatsapp-journey-operator-panel.tsx");
  assert.match(panel, /if \(!weeklyPreview\?\.ready \|\| !weeklyConfirmed\) return/);
  assert.match(panel, /confirmation: "queue_weekly_report"/);
  assert.match(panel, /checked=\{weeklyConfirmed\}/);
  assert.match(panel, /disabled=\{weeklyBusy \|\| !weeklyPreview\.ready \|\| !weeklyConfirmed\}/);
  assert.match(panel, /Nothing is queued until the final checkbox and button are used/);
});

test("operations surfaces pending WhatsApp move-out requests with a settlement path", async () => {
  const [page, workspace, data] = await Promise.all([
    read("app/operations/page.tsx"),
    read("components/operations-workspace.tsx"),
    read("lib/move-out-request-data.ts"),
  ]);
  assert.match(data, /\.in\("state", \["requested", "acknowledged", "settlement_ready"\]\)/);
  assert.match(data, /\.eq\("organization_id", organizationId\)/);
  assert.match(data, /\.eq\("property_id", propertyId\)/);
  assert.match(page, /getPendingMoveOutRequests\(organizationId, propertyId\)/);
  assert.match(workspace, /Pending move-outs/);
  assert.match(workspace, /requestedExitDate: request\.requestedExitDate/);
  assert.match(workspace, /setMoveOutResident\(\{/);
  assert.match(workspace, /Prepare settlement/);
});

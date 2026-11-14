"use client";

import { AppShell } from "@/components/app-shell";
import { CollectionsWorkspace } from "@/components/collections-workspace";
import { OperationsWorkspace } from "@/components/operations-workspace";
import { PaymentRequest } from "@/components/payment-request";
import { ProductionOverview } from "@/components/production-overview";
import { ReportsWorkspace } from "@/components/reports-workspace";
import { ResidentSetupWorkspace } from "@/components/resident-setup-workspace";
import { RoomSetupWorkspace } from "@/components/room-setup-workspace";
import { UpiSettingsCard } from "@/components/upi-settings-card";
import { WhatsAppAutomationCard } from "@/components/whatsapp-automation-card";
import { useCallback } from "react";
import { useDemoView } from "./runtime";
import {
  DEMO_PG_NAME,
  demoCollectionsData,
  demoOperationsData,
  demoOverviewData,
  demoPaymentRequest,
  demoReportsData,
  demoResidentsData,
  demoRoomsData,
  type DemoState,
} from "./store";

// The real screens, fed by the in-browser demo PG. The visitor acts as the owner.

export function DemoOverview() {
  const data = useDemoView(demoOverviewData);
  return <AppShell demoMode><ProductionOverview tenantName={DEMO_PG_NAME} role="owner" data={data} /></AppShell>;
}

export function DemoRooms() {
  return <RoomSetupWorkspace data={useDemoView(demoRoomsData)} demoMode />;
}

export function DemoResidents() {
  return <ResidentSetupWorkspace data={useDemoView(demoResidentsData)} demoMode />;
}

export function DemoCollections() {
  return <CollectionsWorkspace data={useDemoView(demoCollectionsData)} canGenerate canReview role="owner" demoMode />;
}

export function DemoOperations() {
  return <OperationsWorkspace data={useDemoView(demoOperationsData)} demoMode canManage role="owner" />;
}

export function DemoReports() {
  return <ReportsWorkspace data={useDemoView(demoReportsData)} demoMode />;
}

const selectSettings = (state: DemoState) => state.settings;

/** Settings cards that start from whatever the visitor last saved in this tab. */
export function DemoPaymentSettings() {
  const settings = useDemoView(selectSettings);
  return (
    <>
      <WhatsAppAutomationCard initial={{ autoReminders: settings.autoReminders, autoReceipts: settings.autoReceipts, language: settings.language }} demoMode />
      <UpiSettingsCard initial={{ upiId: settings.upiId, payeeName: settings.payeeName, notePrefix: settings.notePrefix, hasUploadedQr: settings.hasUploadedQr }} demoMode />
    </>
  );
}

/** The resident's side: the page a payment link opens. Proof sent here shows up in Collections. */
export function DemoPay({ invoiceId }: { invoiceId: string }) {
  const select = useCallback((state: DemoState) => demoPaymentRequest(invoiceId, state), [invoiceId]);
  return <PaymentRequest data={useDemoView(select)} backHref="/collections" backLabel="Back to Collections" demoMode />;
}

import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { BusinessHomepage } from "@/components/business-homepage";
import { DemoDashboard } from "@/components/demo-dashboard";
import { ProductionOverview } from "@/components/production-overview";
import { normalizeHostname } from "@/lib/branding";
import { getCollectionsData } from "@/lib/collections";
import { requireStaffPage, type StaffPageRole } from "@/lib/page-authorization";
import { getResidentSetupData } from "@/lib/resident-setup";
import { getRoomSetupData } from "@/lib/room-setup";
import { hostnameFromHeaders } from "@/lib/tenancy";
import { isPlatformLoginHostname } from "@/lib/workspace-login";

const isPublicPlatformHomepage = cache(async () => {
  const hostname = hostnameFromHeaders(await headers());
  const platformDomain = normalizeHostname(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? null);

  return (
    isPlatformLoginHostname(hostname, platformDomain)
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
  );
});

export async function generateMetadata(): Promise<Metadata> {
  if (await isPublicPlatformHomepage()) {
    return {
      title: "WhatsApp-first PG operations",
      description: "Run rooms, residents, rent, payment review, receipts, and everyday PG work from one WhatsApp-first owner workspace.",
    };
  }

  return {
    title: "Overview",
    description: "Your PG workspace for residents, rooms, rent, payments, and everyday operations.",
  };
}

export default async function Home(props: { searchParams?: Promise<{ marketing?: string }> }) {
  const searchParams = await props.searchParams;
  if (searchParams?.marketing === "true") {
    return <BusinessHomepage />;
  }

  const authorization = await requireStaffPage(["owner", "manager", "accountant"]).catch(() => ({ mode: "demo" as const }));
  if (authorization.mode === "demo") {
    return <AppShell demoMode><DemoDashboard /></AppShell>;
  }

  const staffRole = authorization.actor.role as StaffPageRole;
  const propertyId = authorization.actor.propertyId;
  if (!propertyId) {
    return (
      <AppShell demoMode={false}>
        <ProductionOverview tenantName={authorization.tenant.name} role={staffRole} data={null} />
      </AppShell>
    );
  }

  const [rooms, residents, collections] = await Promise.all([
    getRoomSetupData(authorization.actor.organizationId, propertyId),
    getResidentSetupData(authorization.actor.organizationId, propertyId),
    getCollectionsData(authorization.actor.organizationId, propertyId),
  ]);

  return (
    <AppShell demoMode={false}>
      <ProductionOverview
        tenantName={authorization.tenant.name}
        role={staffRole}
        data={{
          rooms: rooms.totals,
          residents: {
            residentLimit: residents.residentLimit,
            ...residents.totals,
          },
          collections: {
            periodLabel: collections.periodLabel,
            upiConfigured: collections.upiConfigured,
            pendingPayments: collections.pendingPayments.length,
            ...collections.totals,
          },
        }}
      />
    </AppShell>
  );
}


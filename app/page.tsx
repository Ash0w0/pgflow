import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { BusinessHomepage } from "@/components/business-homepage";
import { ProductionOverview } from "@/components/production-overview";
import { normalizeHostname } from "@/lib/branding";
import { getCollectionsData } from "@/lib/collections";
import { requireStaffPage, type StaffPageRole } from "@/lib/page-authorization";
import { getResidentSetupData } from "@/lib/resident-setup";
import { getRoomSetupData } from "@/lib/room-setup";
import { hostnameFromHeaders } from "@/lib/tenancy";
import { isDemoRuntime } from "@/lib/runtime";
import { isPlatformLoginHostname } from "@/lib/workspace-login";

const isPublicPlatformHomepage = cache(async () => {
  if (isDemoRuntime()) return false;
  const hostname = hostnameFromHeaders(await headers());
  const platformDomain = normalizeHostname(process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? null);

  return (
    isPlatformLoginHostname(hostname, platformDomain)
    || hostname === "localhost"
    || hostname.endsWith(".vercel.app")
  );
});

export async function generateMetadata(): Promise<Metadata> {
  if (isDemoRuntime()) {
    return {
      title: "Guided product demo",
      description: "Explore PGFlow with fictional, isolated sample data.",
    };
  }
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

export default async function Home() {
  if (isDemoRuntime()) {
    await requireStaffPage(["owner", "manager", "accountant"]);
    const { DemoDashboard } = await import("@/demo/components/demo-dashboard");
    return <AppShell demoMode><DemoDashboard /></AppShell>;
  }

  if (await isPublicPlatformHomepage()) return <BusinessHomepage />;

  const authorization = await requireStaffPage(["owner", "manager", "accountant"]);
  if (authorization.mode !== "production") {
    throw new Error("Demo authorization cannot enter the production home route.");
  }
  const staffRole = authorization.actor.role as StaffPageRole;
  const propertyId = authorization.actor.propertyId;
  if (!propertyId) {
    return (
      <AppShell demoMode={false} role={authorization.mode === "production" ? authorization.actor.role : undefined}>
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
    <AppShell demoMode={false} role={authorization.mode === "production" ? authorization.actor.role : undefined}>
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

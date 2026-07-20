import "server-only";

import { billingPeriodEnd, billingPeriodLabel, currentIndiaBillingPeriod } from "./billing-period";
import type { CollectionsData, CollectionInvoiceRow } from "./collections-types";
import { getSupabaseAdmin } from "./supabase/admin";

export async function getCollectionsData(organizationId: string, propertyId: string): Promise<CollectionsData> {
  const admin = getSupabaseAdmin();
  const period = currentIndiaBillingPeriod();
  const [propertyResult, tenantsResult, occupanciesResult, bedsResult, roomsResult, invoicesResult, paymentsResult] = await Promise.all([
    admin.from("properties").select("rent_due_day,upi_id,upi_payee_name").eq("organization_id", organizationId).eq("id", propertyId).single(),
    admin.from("tenant_profiles").select("id,full_name,phone,state").eq("organization_id", organizationId).eq("property_id", propertyId).limit(250),
    admin.from("occupancies").select("tenant_id,bed_id,move_in_date,monthly_rent,state").eq("organization_id", organizationId).eq("property_id", propertyId).in("state", ["active", "notice"]).limit(250),
    admin.from("beds").select("id,room_id,label").eq("organization_id", organizationId).eq("property_id", propertyId).limit(500),
    admin.from("rooms").select("id,code").eq("organization_id", organizationId).eq("property_id", propertyId).limit(250),
    admin.from("invoices").select("id,tenant_id,period,number,due_date,total_amount,paid_amount,state").eq("organization_id", organizationId).eq("property_id", propertyId).order("due_date", { ascending: false }).limit(1000),
    admin.from("payments").select("id,tenant_id,invoice_id,method,amount,reference,paid_at,state").eq("organization_id", organizationId).eq("property_id", propertyId).eq("state", "pending_review").order("created_at", { ascending: true }).limit(250),
  ]);

  for (const [label, result] of [
    ["property", propertyResult], ["residents", tenantsResult], ["occupancies", occupanciesResult],
    ["beds", bedsResult], ["rooms", roomsResult], ["invoices", invoicesResult], ["payments", paymentsResult],
  ] as const) {
    if (result.error) throw new Error(`Collection ${label} could not be loaded: ${result.error.message}`);
  }
  if (!propertyResult.data) throw new Error("Collection property could not be loaded.");

  const tenants = new Map((tenantsResult.data ?? []).map((tenant) => [tenant.id, tenant]));
  const beds = new Map((bedsResult.data ?? []).map((bed) => [bed.id, bed]));
  const rooms = new Map((roomsResult.data ?? []).map((room) => [room.id, room]));
  const currentInvoiceTenants = new Set((invoicesResult.data ?? []).filter((invoice) => invoice.period === period).map((invoice) => invoice.tenant_id));
  const roomByTenant = new Map<string, string>();
  const periodEnd = billingPeriodEnd(period);

  const preview = (occupanciesResult.data ?? []).flatMap((occupancy) => {
    const tenant = tenants.get(occupancy.tenant_id);
    const bed = beds.get(occupancy.bed_id);
    const room = bed ? rooms.get(bed.room_id) : null;
    if (!tenant || !bed || !room || !["active", "notice"].includes(tenant.state) || occupancy.move_in_date > periodEnd) return [];
    const roomLabel = `${room.code} · ${bed.label}`;
    roomByTenant.set(tenant.id, roomLabel);
    return [{
      tenantId: tenant.id,
      residentName: tenant.full_name,
      roomLabel,
      rent: Number(occupancy.monthly_rent),
      alreadyIssued: currentInvoiceTenants.has(tenant.id),
    }];
  }).sort((left, right) => left.residentName.localeCompare(right.residentName));

  const invoices: CollectionInvoiceRow[] = (invoicesResult.data ?? []).flatMap((invoice) => {
    const tenant = tenants.get(invoice.tenant_id);
    if (!tenant) return [];
    return [{
      id: invoice.id,
      residentName: tenant.full_name,
      residentPhone: tenant.phone,
      roomLabel: roomByTenant.get(tenant.id) ?? "Previous occupancy",
      period: invoice.period,
      number: invoice.number,
      dueDate: invoice.due_date,
      totalAmount: Number(invoice.total_amount),
      paidAmount: Number(invoice.paid_amount),
      state: invoice.state as CollectionInvoiceRow["state"],
    }];
  });

  const collectible = invoices.filter((invoice) => invoice.state !== "void" && invoice.state !== "draft");
  const ready = preview.filter((row) => !row.alreadyIssued);
  return {
    period,
    periodLabel: billingPeriodLabel(period),
    dueDay: Number(propertyResult.data.rent_due_day),
    preview,
    invoices,
    upiConfigured: Boolean(propertyResult.data.upi_id && propertyResult.data.upi_payee_name),
    pendingPayments: (paymentsResult.data ?? []).flatMap((payment) => {
      const tenant = tenants.get(payment.tenant_id);
      if (!tenant || !payment.invoice_id) return [];
      return [{ id: payment.id, invoiceId: payment.invoice_id, residentName: tenant.full_name, method: payment.method as "upi" | "cash", amount: Number(payment.amount), reference: payment.reference ?? "—", paidAt: payment.paid_at }];
    }),
    totals: {
      invoiceCount: collectible.length,
      totalBilled: collectible.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
      totalCollected: collectible.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
      totalOutstanding: collectible.reduce((sum, invoice) => sum + invoice.totalAmount - invoice.paidAmount, 0),
      overdueCount: collectible.filter((invoice) => invoice.state === "overdue").length,
      readyToGenerateCount: ready.length,
      readyToGenerateTotal: ready.reduce((sum, row) => sum + row.rent, 0),
    },
  };
}

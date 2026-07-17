import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const templateVersions = sqliteTable("template_versions", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  status: text("status", { enum: ["draft", "current", "retired"] }).notNull().default("draft"),
  contractJson: text("contract_json").notNull().default("{}"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("template_versions_version_uq").on(table.version)]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  templateVersionId: text("template_version_id").notNull().references(() => templateVersions.id),
  state: text("state", { enum: ["draft", "core_ready", "integrations_pending", "live", "suspended", "archived"] }).notNull().default("draft"),
  demoMode: integer("demo_mode", { mode: "boolean" }).notNull().default(false),
  locale: text("locale").notNull().default("en-IN"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  retentionDays: integer("retention_days").notNull().default(365),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("organizations_slug_uq").on(table.slug), index("organizations_state_idx").on(table.state)]);

export const properties = sqliteTable("properties", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  supportPhone: text("support_phone").notNull().default(""),
  rentDueDay: integer("rent_due_day").notNull().default(5),
  electricityMode: text("electricity_mode", { enum: ["disabled", "flat", "manual", "tenant_meter", "shared_room_meter"] }).notNull().default("manual"),
  electricityRate: real("electricity_rate").notNull().default(0),
  noticeDays: integer("notice_days").notNull().default(30),
  upiId: text("upi_id").notNull().default(""),
  upiPayeeName: text("upi_payee_name").notNull().default(""),
  requireCashApproval: integer("require_cash_approval", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("properties_org_idx").on(table.organizationId)]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").references(() => properties.id),
  authUserId: text("auth_user_id").notNull(),
  phone: text("phone").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["platform_operator", "owner", "manager", "accountant", "tenant"] }).notNull(),
  state: text("state", { enum: ["invited", "active", "disabled"] }).notNull().default("invited"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("memberships_org_user_uq").on(table.organizationId, table.authUserId), index("memberships_org_role_idx").on(table.organizationId, table.role)]);

export const brandThemes = sqliteTable("brand_themes", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  logoKey: text("logo_key"),
  primaryColor: text("primary_color").notNull().default("#123d32"),
  accentColor: text("accent_color").notNull().default("#d7ff86"),
  appName: text("app_name").notNull(),
  shortName: text("short_name").notNull(),
  poweredByEnabled: integer("powered_by_enabled", { mode: "boolean" }).notNull().default(true),
  tokenJson: text("token_json").notNull().default("{}"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("brand_themes_org_uq").on(table.organizationId)]);

export const domainMappings = sqliteTable("domain_mappings", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  hostname: text("hostname").notNull(),
  kind: text("kind", { enum: ["platform_subdomain", "custom"] }).notNull(),
  state: text("state", { enum: ["pending", "verified", "failed"] }).notNull().default("pending"),
  verificationJson: text("verification_json").notNull().default("{}"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("domain_mappings_hostname_uq").on(table.hostname), index("domain_mappings_org_idx").on(table.organizationId)]);

export const floors = sqliteTable("floors", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [uniqueIndex("floors_property_name_uq").on(table.organizationId, table.propertyId, table.name)]);

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  floorId: text("floor_id").notNull().references(() => floors.id),
  code: text("code").notNull(),
  roomType: text("room_type").notNull().default("shared"),
  capacity: integer("capacity").notNull(),
  defaultRent: integer("default_rent").notNull(),
  state: text("state", { enum: ["active", "maintenance", "inactive"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("rooms_property_code_uq").on(table.organizationId, table.propertyId, table.code), index("rooms_org_floor_idx").on(table.organizationId, table.floorId)]);

export const beds = sqliteTable("beds", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  label: text("label").notNull(),
  rentOverride: integer("rent_override"),
  state: text("state", { enum: ["vacant", "reserved", "occupied", "notice_period", "maintenance", "inactive"] }).notNull().default("vacant"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("beds_room_label_uq").on(table.organizationId, table.roomId, table.label), index("beds_org_state_idx").on(table.organizationId, table.state)]);

export const tenantProfiles = sqliteTable("tenant_profiles", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  membershipId: text("membership_id").references(() => memberships.id),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  alternatePhone: text("alternate_phone"),
  emergencyName: text("emergency_name").notNull().default(""),
  emergencyPhone: text("emergency_phone").notNull().default(""),
  address: text("address").notNull().default(""),
  governmentIdType: text("government_id_type"),
  governmentIdMasked: text("government_id_masked"),
  state: text("state", { enum: ["active", "notice", "moved_out", "archived"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("tenant_profiles_org_phone_uq").on(table.organizationId, table.phone), index("tenant_profiles_org_state_idx").on(table.organizationId, table.state)]);

export const occupancies = sqliteTable("occupancies", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id),
  bedId: text("bed_id").notNull().references(() => beds.id),
  moveInDate: text("move_in_date").notNull(),
  moveOutDate: text("move_out_date"),
  monthlyRent: integer("monthly_rent").notNull(),
  depositPromised: integer("deposit_promised").notNull().default(0),
  state: text("state", { enum: ["active", "notice", "completed", "cancelled"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  index("occupancies_org_tenant_idx").on(table.organizationId, table.tenantId),
  index("occupancies_org_bed_idx").on(table.organizationId, table.bedId),
  uniqueIndex("occupancies_active_bed_uq").on(table.organizationId, table.bedId).where(sql`${table.state} in ('active', 'notice')`),
]);

export const billingCycles = sqliteTable("billing_cycles", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  period: text("period").notNull(),
  dueDate: text("due_date").notNull(),
  state: text("state", { enum: ["draft", "issued", "closed"] }).notNull().default("draft"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("billing_cycles_property_period_uq").on(table.organizationId, table.propertyId, table.period)]);

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  billingCycleId: text("billing_cycle_id").notNull().references(() => billingCycles.id),
  tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id),
  number: text("number").notNull(),
  dueDate: text("due_date").notNull(),
  totalAmount: integer("total_amount").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),
  state: text("state", { enum: ["draft", "issued", "partially_paid", "paid", "overdue", "void"] }).notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("invoices_org_number_uq").on(table.organizationId, table.number), uniqueIndex("invoices_cycle_tenant_uq").on(table.organizationId, table.billingCycleId, table.tenantId), index("invoices_org_state_idx").on(table.organizationId, table.state)]);

export const invoiceLineItems = sqliteTable("invoice_line_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  kind: text("kind", { enum: ["rent", "electricity", "adjustment", "credit"] }).notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
}, (table) => [index("invoice_line_items_org_invoice_idx").on(table.organizationId, table.invoiceId)]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id),
  method: text("method", { enum: ["upi", "cash"] }).notNull(),
  amount: integer("amount").notNull(),
  reference: text("reference"),
  state: text("state", { enum: ["pending_review", "approved", "rejected", "reversed", "refunded"] }).notNull().default("pending_review"),
  paidAt: text("paid_at").notNull(),
  submittedBy: text("submitted_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("payments_org_reference_uq").on(table.organizationId, table.reference), index("payments_org_state_idx").on(table.organizationId, table.state)]);

export const paymentAllocations = sqliteTable("payment_allocations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  amount: integer("amount").notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("payment_allocations_payment_invoice_uq").on(table.organizationId, table.paymentId, table.invoiceId)]);

export const paymentEvidence = sqliteTable("payment_evidence", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  fileHash: text("file_hash").notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("payment_evidence_org_hash_uq").on(table.organizationId, table.fileHash)]);

export const depositEntries = sqliteTable("deposit_entries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id),
  kind: text("kind", { enum: ["promised", "received", "deduction", "refund", "reversal"] }).notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull().default(""),
  approvedBy: text("approved_by"),
  occurredAt: text("occurred_at").notNull(),
  createdAt: createdAt(),
}, (table) => [index("deposit_entries_org_tenant_idx").on(table.organizationId, table.tenantId)]);

export const complaints = sqliteTable("complaints", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  tenantId: text("tenant_id").references(() => tenantProfiles.id),
  roomId: text("room_id").references(() => rooms.id),
  category: text("category").notNull(),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  assignedTo: text("assigned_to"),
  state: text("state", { enum: ["open", "assigned", "in_progress", "waiting_for_tenant", "resolved", "closed", "cancelled"] }).notNull().default("open"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("complaints_org_state_idx").on(table.organizationId, table.state)]);

export const notices = sqliteTable("notices", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  titleEn: text("title_en").notNull(),
  bodyEn: text("body_en").notNull(),
  titleHi: text("title_hi").notNull().default(""),
  bodyHi: text("body_hi").notNull().default(""),
  audienceJson: text("audience_json").notNull().default("{}"),
  scheduledAt: text("scheduled_at"),
  state: text("state", { enum: ["draft", "scheduled", "sending", "sent", "cancelled"] }).notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("notices_org_state_idx").on(table.organizationId, table.state)]);

export const moveOutRequests = sqliteTable("move_out_requests", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  propertyId: text("property_id").notNull().references(() => properties.id),
  tenantId: text("tenant_id").notNull().references(() => tenantProfiles.id),
  requestedDate: text("requested_date").notNull(),
  approvedDate: text("approved_date"),
  reason: text("reason").notNull().default(""),
  state: text("state", { enum: ["requested", "under_review", "approved", "checkout_pending", "settlement_pending", "settled", "cancelled"] }).notNull().default("requested"),
  finalElectricity: integer("final_electricity").notNull().default(0),
  deductionsTotal: integer("deductions_total").notNull().default(0),
  refundAmount: integer("refund_amount").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index("move_out_requests_org_state_idx").on(table.organizationId, table.state)]);

export const whatsappConnections = sqliteTable("whatsapp_connections", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  wabaId: text("waba_id"),
  phoneNumberId: text("phone_number_id"),
  displayPhone: text("display_phone"),
  secretRef: text("secret_ref"),
  state: text("state", { enum: ["demo", "pending", "connected", "failed", "disabled"] }).notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("whatsapp_connections_phone_number_uq").on(table.phoneNumberId), uniqueIndex("whatsapp_connections_org_uq").on(table.organizationId)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  providerMessageId: text("provider_message_id"),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  recipient: text("recipient").notNull(),
  templateName: text("template_name"),
  contentJson: text("content_json").notNull(),
  state: text("state", { enum: ["queued", "sent", "delivered", "read", "failed"] }).notNull().default("queued"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("messages_provider_id_uq").on(table.providerMessageId), index("messages_org_state_idx").on(table.organizationId, table.state)]);

export const provisioningJobs = sqliteTable("provisioning_jobs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  templateVersionId: text("template_version_id").notNull().references(() => templateVersions.id),
  state: text("state", { enum: ["draft", "awaiting_data", "validating", "ready_to_provision", "provisioning", "core_ready", "integrations_pending", "live", "failed"] }).notNull().default("draft"),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedBy: text("requested_by").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex("provisioning_jobs_idempotency_uq").on(table.idempotencyKey), index("provisioning_jobs_state_idx").on(table.state)]);

export const provisioningSteps = sqliteTable("provisioning_steps", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  jobId: text("job_id").notNull().references(() => provisioningJobs.id),
  key: text("key").notNull(),
  sortOrder: integer("sort_order").notNull(),
  state: text("state", { enum: ["pending", "running", "passed", "failed", "skipped"] }).notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  safeMessage: text("safe_message"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
}, (table) => [uniqueIndex("provisioning_steps_job_key_uq").on(table.jobId, table.key)]);

export const outboxEvents = sqliteTable("outbox_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  topic: text("topic").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  payloadJson: text("payload_json").notNull(),
  state: text("state", { enum: ["pending", "processing", "processed", "dead_letter"] }).notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  availableAt: text("available_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  processedAt: text("processed_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("outbox_events_idempotency_uq").on(table.idempotencyKey), index("outbox_events_state_available_idx").on(table.state, table.availableAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
}, (table) => [index("audit_events_org_created_idx").on(table.organizationId, table.createdAt), index("audit_events_entity_idx").on(table.organizationId, table.entityType, table.entityId)]);

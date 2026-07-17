CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`ip_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_org_created_idx` ON `audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`organization_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `beds` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text NOT NULL,
	`label` text NOT NULL,
	`rent_override` integer,
	`state` text DEFAULT 'vacant' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beds_room_label_uq` ON `beds` (`organization_id`,`room_id`,`label`);--> statement-breakpoint
CREATE INDEX `beds_org_state_idx` ON `beds` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `billing_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`period` text NOT NULL,
	`due_date` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_cycles_property_period_uq` ON `billing_cycles` (`organization_id`,`property_id`,`period`);--> statement-breakpoint
CREATE TABLE `brand_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`logo_key` text,
	`primary_color` text DEFAULT '#123d32' NOT NULL,
	`accent_color` text DEFAULT '#d7ff86' NOT NULL,
	`app_name` text NOT NULL,
	`short_name` text NOT NULL,
	`powered_by_enabled` integer DEFAULT true NOT NULL,
	`token_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brand_themes_org_uq` ON `brand_themes` (`organization_id`);--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text,
	`room_id` text,
	`category` text NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`assigned_to` text,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `complaints_org_state_idx` ON `complaints` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `deposit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`approved_by` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deposit_entries_org_tenant_idx` ON `deposit_entries` (`organization_id`,`tenant_id`);--> statement-breakpoint
CREATE TABLE `domain_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`hostname` text NOT NULL,
	`kind` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`verification_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_mappings_hostname_uq` ON `domain_mappings` (`hostname`);--> statement-breakpoint
CREATE INDEX `domain_mappings_org_idx` ON `domain_mappings` (`organization_id`);--> statement-breakpoint
CREATE TABLE `floors` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `floors_property_name_uq` ON `floors` (`organization_id`,`property_id`,`name`);--> statement-breakpoint
CREATE TABLE `invoice_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoice_line_items_org_invoice_idx` ON `invoice_line_items` (`organization_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`billing_cycle_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`number` text NOT NULL,
	`due_date` text NOT NULL,
	`total_amount` integer NOT NULL,
	`paid_amount` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`billing_cycle_id`) REFERENCES `billing_cycles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_org_number_uq` ON `invoices` (`organization_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_cycle_tenant_uq` ON `invoices` (`organization_id`,`billing_cycle_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `invoices_org_state_idx` ON `invoices` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text,
	`auth_user_id` text NOT NULL,
	`phone` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`state` text DEFAULT 'invited' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_uq` ON `memberships` (`organization_id`,`auth_user_id`);--> statement-breakpoint
CREATE INDEX `memberships_org_role_idx` ON `memberships` (`organization_id`,`role`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider_message_id` text,
	`direction` text NOT NULL,
	`recipient` text NOT NULL,
	`template_name` text,
	`content_json` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_provider_id_uq` ON `messages` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `messages_org_state_idx` ON `messages` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `move_out_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`requested_date` text NOT NULL,
	`approved_date` text,
	`reason` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'requested' NOT NULL,
	`final_electricity` integer DEFAULT 0 NOT NULL,
	`deductions_total` integer DEFAULT 0 NOT NULL,
	`refund_amount` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `move_out_requests_org_state_idx` ON `move_out_requests` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`title_en` text NOT NULL,
	`body_en` text NOT NULL,
	`title_hi` text DEFAULT '' NOT NULL,
	`body_hi` text DEFAULT '' NOT NULL,
	`audience_json` text DEFAULT '{}' NOT NULL,
	`scheduled_at` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notices_org_state_idx` ON `notices` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `occupancies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`bed_id` text NOT NULL,
	`move_in_date` text NOT NULL,
	`move_out_date` text,
	`monthly_rent` integer NOT NULL,
	`deposit_promised` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bed_id`) REFERENCES `beds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `occupancies_org_tenant_idx` ON `occupancies` (`organization_id`,`tenant_id`);--> statement-breakpoint
CREATE INDEX `occupancies_org_bed_idx` ON `occupancies` (`organization_id`,`bed_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`template_version_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`demo_mode` integer DEFAULT false NOT NULL,
	`locale` text DEFAULT 'en-IN' NOT NULL,
	`timezone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`retention_days` integer DEFAULT 365 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (`slug`);--> statement-breakpoint
CREATE INDEX `organizations_state_idx` ON `organizations` (`state`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`topic` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_json` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_events_idempotency_uq` ON `outbox_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `outbox_events_state_available_idx` ON `outbox_events` (`state`,`available_at`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_allocations_payment_invoice_uq` ON `payment_allocations` (`organization_id`,`payment_id`,`invoice_id`);--> statement-breakpoint
CREATE TABLE `payment_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`file_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_evidence_org_hash_uq` ON `payment_evidence` (`organization_id`,`file_hash`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`method` text NOT NULL,
	`amount` integer NOT NULL,
	`reference` text,
	`state` text DEFAULT 'pending_review' NOT NULL,
	`paid_at` text NOT NULL,
	`submitted_by` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`rejection_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenant_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_org_reference_uq` ON `payments` (`organization_id`,`reference`);--> statement-breakpoint
CREATE INDEX `payments_org_state_idx` ON `payments` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`support_phone` text DEFAULT '' NOT NULL,
	`rent_due_day` integer DEFAULT 5 NOT NULL,
	`electricity_mode` text DEFAULT 'manual' NOT NULL,
	`electricity_rate` real DEFAULT 0 NOT NULL,
	`notice_days` integer DEFAULT 30 NOT NULL,
	`upi_id` text DEFAULT '' NOT NULL,
	`upi_payee_name` text DEFAULT '' NOT NULL,
	`require_cash_approval` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `properties_org_idx` ON `properties` (`organization_id`);--> statement-breakpoint
CREATE TABLE `provisioning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`template_version_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`idempotency_key` text NOT NULL,
	`requested_by` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_version_id`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provisioning_jobs_idempotency_uq` ON `provisioning_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `provisioning_jobs_state_idx` ON `provisioning_jobs` (`state`);--> statement-breakpoint
CREATE TABLE `provisioning_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`job_id` text NOT NULL,
	`key` text NOT NULL,
	`sort_order` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`safe_message` text,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `provisioning_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provisioning_steps_job_key_uq` ON `provisioning_steps` (`job_id`,`key`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`floor_id` text NOT NULL,
	`code` text NOT NULL,
	`room_type` text DEFAULT 'shared' NOT NULL,
	`capacity` integer NOT NULL,
	`default_rent` integer NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_property_code_uq` ON `rooms` (`organization_id`,`property_id`,`code`);--> statement-breakpoint
CREATE INDEX `rooms_org_floor_idx` ON `rooms` (`organization_id`,`floor_id`);--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`contract_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_versions_version_uq` ON `template_versions` (`version`);--> statement-breakpoint
CREATE TABLE `tenant_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`property_id` text NOT NULL,
	`membership_id` text,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`alternate_phone` text,
	`emergency_name` text DEFAULT '' NOT NULL,
	`emergency_phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`government_id_type` text,
	`government_id_masked` text,
	`state` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_profiles_org_phone_uq` ON `tenant_profiles` (`organization_id`,`phone`);--> statement-breakpoint
CREATE INDEX `tenant_profiles_org_state_idx` ON `tenant_profiles` (`organization_id`,`state`);--> statement-breakpoint
CREATE TABLE `whatsapp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`waba_id` text,
	`phone_number_id` text,
	`display_phone` text,
	`secret_ref` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_phone_number_uq` ON `whatsapp_connections` (`phone_number_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_org_uq` ON `whatsapp_connections` (`organization_id`);
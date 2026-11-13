# Operator runbooks

Every incident starts by recording organization, actor, purpose, timestamps, affected records, and a safe diagnostic message. Never paste phone numbers, IDs, UTRs, screenshots, secrets, or full financial records into logs or tickets.

## Failed WhatsApp delivery

1. Confirm the organization and `phone_number_id` mapping.
2. Check consent, template language/approval, quiet hours, and provider error code.
3. Retry only through the idempotent outbox event.
4. Move exhausted work to dead letter and notify the owner through the dashboard.
5. Never send from another PG’s number.

## Payment/UTR dispute

1. Freeze the pending evidence; never edit or delete it.
2. Compare the submitted amount, normalized UTR, date, screenshot hash, invoice balance, and earlier submissions within the same PG.
3. The owner/accountant checks the PG bank app or bank statement outside PGFlow.
4. Approve or reject with a reason. A screenshot alone is never approval.
5. Correct an approved error with a reversal and replacement entry; retain both audit records.

## Incorrect cash entry

1. Identify the receiving staff member and collection timestamp.
2. If pending, reject with reason. If approved, create a reversal—never delete.
3. Record the corrected replacement payment and issue a new receipt number.
4. Notify the resident and owner.

## Stuck provisioning

1. Load the provisioning job and last completed step by idempotency key.
2. Validate the organization slug, hostname, import totals, storage namespace, roles, and template version.
3. Retry only the failed idempotent step.
4. Keep the platform subdomain working even if custom DNS or Meta approval is pending.
5. Escalate after the retry budget; never copy demo records into the real organization.

## Data export or deletion

1. Re-authenticate the owner and confirm organization scope.
2. Record request purpose and statutory/contractual retention constraints.
3. Generate an encrypted, expiring export and audit access.
4. Soft-delete first, then irreversibly remove after the recovery window.
5. Include private objects and backup-retention treatment in the completion report.

## Suspected breach

1. Contain affected sessions, credentials, integration tokens, and support access.
2. Preserve audit/outbox/provider evidence without copying PII into incident chat.
3. Determine organizations, people, data classes, and time range affected.
4. Notify the incident owner and follow the legally reviewed DPDP escalation process.
5. Rotate secrets, remediate, restore safely, and document the post-incident review.

## Restore drill

1. Restore database and private-object backups into an isolated environment.
2. Verify row counts, organization isolation, receipt numbering, payment allocations, and object hashes.
3. Run representative owner, accountant, manager, and tenant journeys.
4. Record recovery point and recovery time achieved.
5. Never reconnect restored staging data to live WhatsApp or UPI configuration.

## Logs, health, and housekeeping

- Server jobs write one-line JSON logs (`lib/log.ts`). In Vercel → Logs, filter on `"level":"error"` or an event name such as `cron.whatsapp_reminders.failed`, `cron.whatsapp_outbox.failed`, `whatsapp.outbox.delivery_failed`, or `cron.maintenance.failed`.
- `GET /api/health` returns 503 with `migrations: "behind-deployed-code"` when the app was deployed before its database migrations were applied. Point an uptime monitor at it.
- `/api/cron/maintenance` runs daily and calls `prune_expired_operational_data()` (migration 0041). It deletes reset rate-limit buckets, expired receipt links, and finished WhatsApp queue rows older than 90 days. Invoices, payments, receipts, message logs, and audit events are never deleted.
- A page that crashes shows a support code (the Next.js error digest). Search Vercel logs for that digest to find the server error.

## Resident app access

- **Give access:** Residents → "Give app" on the resident's row → "Create app login" → send the one-time password on WhatsApp. It is shown once. The resident signs in at the PG's own address with their phone number and must choose a private password.
- **Forgot password:** the same dialog → "Issue a new one". The old password stops working immediately.
- **Lost or shared phone:** "Turn off". This blocks sign-in and ends open sessions. "Turn on" restores it.
- **"This phone number already has a PGFlow login":** the number is already used by staff at this PG or by an account at another PGFlow PG. Linking one phone to two PGs is not supported yet; the resident can keep paying through WhatsApp links.
- **Move-out:** access turns off automatically. Nothing to do.
- Residents can never see another resident's data: every resident query is filtered by their own resident record on the server.

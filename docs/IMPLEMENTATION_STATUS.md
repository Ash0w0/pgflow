# Implementation status

## Demonstration-ready

- Responsive owner/staff dashboard with actionable collection, occupancy, payment-review, complaint, notice, and cash states.
- Dedicated collection, resident, room/bed, operations, reports, and settings workspaces using fictional records.
- Tenant PWA direction, bilingual toggle sample, manual UPI-evidence flow, receipts/history, complaint status, support, and move-out entry points.
- Fictional operator workflow, curated sales presentation, and financially inert payment page.
- Blank template contract and deterministic 3-floor / 24-room / 60-bed / 48-resident demo seed.
- D1 preview schema, Supabase production migration track, R2 evidence-upload boundary, API request validation, Meta signature verification, security headers, and outbox data model.
- Standard onboarding CSV package and automated domain/render/security tests.

## Scaffolded but not live

- Phone/password authentication and OTP recovery.
- Server-verified role and organization claims.
- Supabase persistence and private Storage.
- Immutable ledger transactions, allocation, receipts, reversals, and deposit settlement.
- Transactional import and resumable provisioning.
- Per-host brand/domain/PWA resolution.
- WhatsApp number connection, durable webhook ingestion, templates, reminders, and owner digests.
- English/Hindi message catalog completeness.

API endpoints for these areas either return a contract preview or fail closed. They must not be presented as completed production behavior.

## Pilot blockers

1. Replace the temporary action-token boundary with Supabase-authenticated server claims.
2. Rewrite and execute exhaustive RLS/storage isolation tests; tenants must see only their own records.
3. Add organization-qualified references or trusted transaction services that prevent cross-organization foreign keys.
4. Connect the complete payment vertical slice and prove immutable state transitions.
5. Persist and deduplicate WhatsApp events before acknowledging a real Meta number.
6. Run accessibility, legal/privacy, backup/restore, load, and timed provisioning acceptance gates.

The four-hour onboarding window and 15-minute automation time are product targets, not verified service claims.

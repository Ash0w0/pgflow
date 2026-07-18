# Implementation status

## Demonstration-ready

- Responsive owner/staff dashboard with collection, occupancy, payment-review, complaint, notice, and cash states.
- Dedicated collection, resident, room/bed, operations, reports, and settings workspaces using fictional records.
- Tenant PWA direction, bilingual sample, manual UPI-evidence flow, receipts/history, complaint status, support, and move-out entry points.
- Fictional operator workflow, curated sales presentation, and financially inert payment page.
- Blank template contract and deterministic 3-floor / 24-room / 60-bed / 48-resident demo seed.
- D1 preview schema, Supabase production migration track, API request validation, Meta signature verification, security headers, and outbox data model.
- Standard onboarding CSV package and automated domain/render/security tests.

## Production foundation implemented

- Canonical Next.js/Vercel scripts, with the Vinext/Sites demonstration isolated behind explicit `demo:*` scripts.
- Lazy Supabase browser, server, and service-role clients that remain build-safe when runtime variables are absent.
- Supabase cookie refresh and phone/password sign-in API.
- Real phone/password operator login/logout UI with page-level authorization.
- Actor identity derived from `auth.getUser()`, an active membership, and a verified hostname organization mapping.
- No production trust in caller-provided organization/role headers or a shared action token.
- Server-only platform-operator registry.
- Unknown production hostnames fail closed; no fallback to the fictional organization.
- Supabase private buckets and per-organization Storage policies for payment evidence, tenant documents, and complaint media.
- Explicit anonymous/authenticated grants and a multi-role pgTAP RLS fixture suite.
- GitHub CI for typecheck, lint, tests, Next.js build, production dependency audit, migrations, and database-security tests.
- A current, versioned blank template containing no business records.
- A protected, database-backed operator registry and blank-shell provisioning form.
- Transactional, idempotent core provisioning for one empty organization, property, brand theme, platform hostname, job, ordered steps, and audit event.
- Verified-hostname branding for login, PWA manifest, icon, colors, and draft-workspace status without exposing operational data.
- Server-only manual owner credential issuance with a strong one-time password, SHA-256-only storage, 24-hour expiry, controlled reset, atomic replacement, and operator audit.
- Manual owner activation creates no temporary Auth user, session, JWT, or membership. After the temporary credential is reverified on the correct PG hostname, the Auth user is created with only the owner's final private password and an active owner membership is granted atomically.
- A database-owned activation ID, exact request ID, final-password reconciliation, guarded Auth trigger, and compare-and-swap reset prevent orphan Auth users, stale-password races, competing-request false success, and concurrent-reset ambiguity.
- Operator credentials can be copied or opened as a prefilled `wa.me` draft. The operator reviews and presses Send; no SMS provider, WhatsApp API, or paid messaging service is used for this step.
- Database-backed authentication throttling uses HMAC bucket keys; raw phone numbers and IP addresses are not stored in limiter records.
- Creating or regenerating temporary owner credentials requires the signed-in platform operator to re-enter their current password.
- Active owners can change their password by confirming the current password; successful changes revoke existing sessions and write a secret-free audit event.
- Lost-password recovery is manual and OTP-free: an operator confirms the owner, re-enters the operator password, and shares a short-lived one-time credential. Recovery is bound to one request/password intent, clears the credential hash on completion, and revokes prior sessions.
- Live room/floor/bed setup, resident onboarding and correction, monthly rent generation, invoice registers, and opening-balance handling are organization-qualified and database-backed.
- Direct UPI configuration, optional owner-uploaded private QR, staff-recorded cash, payment-proof uploads, manual review, immutable allocations, numbered receipts, and audited reversals are database-backed. No payment evidence is auto-approved.
- Staff can create a seven-day, invoice-scoped payment link and open a prefilled WhatsApp draft for the resident. Only the SHA-256 token hash is stored; older active links are revoked, used links close after proof submission, and the public page exposes only its bound invoice.

## Scaffolded but not live

- Optional authenticator-app MFA and broader recent re-authentication for other future sensitive settings.
- Existing-account linking is deferred: a phone already present in Supabase Auth cannot yet be attached to another PG or reused from the platform-operator identity.
- Prefilled WhatsApp sharing is convenient but places the temporary credential in a `wa.me` URL; replace it with Web Share or controlled copy/paste before a public rollout if browser-history exposure is unacceptable.
- Deposit collection/refund settlement and downloadable receipt documents.
- Tenant account provisioning and the complete live tenant PWA beyond secure invoice payment links.
- Import staging/validation, job advancement/retry, and complete resumable provisioning beyond the blank-shell and manual-owner-activation transactions.
- Uploaded logo/PWA assets, receipts, and custom-domain operations beyond the working hostname-branding boundary.
- WhatsApp number connection, durable webhook ingestion, templates, reminders, and owner digests.
- English/Hindi message catalog completeness.

API endpoints in unfinished areas either return a contract preview or fail closed. They must not be presented as completed production behavior.

## Pilot blockers

1. Run the pgTAP suite against local/staging Supabase and extend it for every new table and RPC.
2. Run controlled end-to-end activation, password-change, and lost-password recovery exercises with an approved staging phone; no real owner credential should be used for the first rehearsal.
3. Add the remaining organization-qualified schema and trusted transaction services.
4. Complete receipt downloads, deposit settlement, payment-link expiry cleanup, and a controlled end-to-end payment rehearsal.
5. Persist and deduplicate WhatsApp events before acknowledging a real Meta number.
6. Run accessibility, legal/privacy, backup/restore, load, and timed-provisioning acceptance gates.

The four-hour onboarding window and 15-minute automation time are product targets, not verified service claims.

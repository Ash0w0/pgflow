# Cursor handoff

Updated: 2026-07-19 (Asia/Kolkata)

Read this first before changing PGFlow. Also read `README.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/PRODUCTION_SETUP.md`, and `docs/RUNBOOKS.md`.

## Product and locked decisions

PGFlow is one managed, reusable, white-label SaaS for independent Indian PGs, initially targeting 20–200 beds. Each PG is an isolated organization provisioned from one versioned template. Never create customer-specific code forks. The founder's PG must be onboarded through the same process as every customer.

- One property per organization in the MVP; remain multi-property-ready.
- Branded staff dashboard, tenant PWA, secure payment pages, operator console, and fictional sales presentation.
- English and Hindi interfaces.
- Branding is configuration: name, logo, colors, app/receipt identity, subdomain, optional custom domain, contacts, UPI, rules, reminders, and message tone.
- Payments are **direct UPI and staff-recorded cash only**.
- Never add Razorpay, cards, netbanking checkout, gateways, platform-held funds, bank scraping/SMS ingestion, screenshot auto-verification, or automatic UPI approval.
- UPI evidence always requires authenticated owner/accountant review against the PG's bank app or bank SMS.
- No paid SMS OTP or Twilio dependency. An operator issues a strong temporary phone/password credential once; the owner creates a private password. Recovery is manually verified, one-time, short-lived, audited, and revokes prior sessions.
- Temporary credentials and payment links may be shared through a user-reviewed WhatsApp draft. Do not automatically send or persist readable passwords/tokens.
- Each PG will later connect its own WhatsApp Business number through one Meta app. Persistent webhooks, templates, retries, consent, reminders, and digests are not yet live.
- Demo data stays fictional, resettable, unable to send live messages/payments, and is never copied into a real organization.
- Target: branded core account within four working hours after clean, validated inputs. DNS propagation, Meta verification/migration, and template approval are excluded.

## Repository and cloud state

- GitHub: `https://github.com/Ash0w0/pgflow`
- Branch: `codex/pgflow-foundation-checkpoint`
- Draft PR: `https://github.com/Ash0w0/pgflow/pull/1`
- Base: `master`
- Vercel project: `ash0w0s-projects/pgflow`
- Supabase ref: `hphibjrzumcyoulifnsi`
- Supabase URL: `https://hphibjrzumcyoulifnsi.supabase.co`

Do not merge PR 1 until all checks pass. At handoff, Vercel preview and both application CI jobs pass; both database-security jobs fail.

Recent commits:

- `a6b0193` — Fix owner activation audit test type
- `92fde5c` — Include required Vercel build plugin
- `3f0b1b6` — Fix Node 22 CI test compatibility
- `4ec45c2` — Configure Vercel deployment inputs
- `70fb2ee` — Preserve PG hostname in payment links
- `b681f4a` — Add secure WhatsApp payment links
- `f3d5e9f` — Build PGFlow foundation and rent operations

## Verification at handoff

Passing:

- `npm run typecheck`
- `npm run lint`
- `npm test` — 56 tests
- `npm run build`
- GitHub application CI
- Vercel preview build

Local `supabase test db` could not start because Docker Desktop was not running. Never substitute the hosted production database for local tests. GitHub successfully starts an isolated Supabase stack and is the current database-test source of truth.

## Exact active database failure

The first failure was fixed by casting the JSON activation user ID to UUID in `supabase/tests/rls.sql`. The suite then advanced to recovery and exposed a real bug:

```text
ERROR: query returned no rows
CONTEXT: PL/pgSQL function public.issue_owner_password_recovery(...) line 25
```

Manual activation deliberately accepts canonical Indian E.164 with or without the optional leading `+`: Supabase Auth may persist `919876543210`, while membership stores `+919876543210`. Migration `0010_manual_owner_password_recovery.sql` still compares these phone strings exactly during recovery issuance and completion, so it cannot find the valid active owner.

## First Cursor task

Create a forward-only migration:

`supabase/migrations/0012_normalize_owner_recovery_phone.sql`

Do not rely on editing `0010`; it may already be applied. Update both recovery functions so both sides of each phone comparison use the trusted normalization from `0011_fix_manual_owner_auth_trigger_match.sql`:

```sql
pg_catalog.regexp_replace(
  pg_catalog.btrim(coalesce(phone_value, '')),
  '^\+',
  ''
)
```

Requirements:

1. Normalize both recovery issuance and completion comparisons.
2. Preserve organization, active-owner, confirmed-phone, operator, request-ID, intent-hash, expiry, and state checks.
3. Preserve `security definer`, empty `search_path`, and service-role-only RPC grants.
4. Prefer a fail-closed migration that verifies expected old function fragments before replacement, following `0011`.
5. Existing tests must exercise issuance and completion with the no-leading-plus Auth representation. Do not weaken tests.
6. Push to the same branch/PR and wait for all checks.

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
supabase test db
gh pr checks 1 --watch --interval 10
```

If Docker is unavailable, push the focused migration and use GitHub's isolated database-security job. Inspect any new failure before changing more code.

## Vercel deployment continuation

Production variable names already configured in Vercel (never print or commit values):

- `PGFLOW_RUNTIME`
- `NEXT_PUBLIC_PLATFORM_NAME`
- `NEXT_PUBLIC_PLATFORM_DOMAIN`
- `OPERATOR_HOSTNAME`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `AUTH_RATE_LIMIT_SECRET`

Bootstrap credentials, Twilio variables, WhatsApp secrets, and the short-lived Vercel OIDC token were deliberately not uploaded to production.

The two hostname variables currently use the temporary `pgflow.vercel.app` assumption. After the first production deployment, confirm the actual hostname, correct both variables if needed, and redeploy. The operator console must not be exposed on a customer hostname.

After every PR check passes:

1. Review the complete PR and scan staged files for secrets.
2. Mark PR 1 ready and squash-merge into `master`; merging triggers production deployment.
3. Monitor Vercel and `/api/health`.
4. Verify unknown/customer hosts cannot access operator routes.
5. Apply new Supabase migrations through the normal linked migration workflow before using the feature.
6. Map Aster Test House to a dedicated approved Vercel hostname/domain mapping.
7. Smoke-test operator login, owner login, rooms, residents, collections, settings, secure payment links, and public proof upload without making a real payment.

Do not onboard a real external PG or promise the four-hour SLA yet. Pilot blockers in `docs/IMPLEMENTATION_STATUS.md` remain active.

## Implemented foundation

- Supabase phone/password auth and server-authorized operator/owner sessions.
- Show-once temporary owner credentials, owner-created password, password change/reset, and manual recovery.
- Atomic guarded owner activation.
- Versioned blank template and blank PG provisioning.
- Verified-host branding, dynamic PWA identity, and operator-host separation.
- Floor/room/bed setup, residents, occupancy, opening balances, rent generation, and invoice register.
- Direct UPI settings, exact invoice QR/URI, optional private owner QR, private evidence, duplicate checks, manual review, allocations, receipts, cash, and reversals.
- Seven-day invoice-scoped payment links with hash-only storage and reviewed WhatsApp drafts.
- RLS, private Storage boundaries, auditing, rate limits, and GitHub CI.

## Main unfinished work after deployment stabilization

1. Transactional import staging/validation/preview/commit and resumable provisioning.
2. Three no-code synthetic provisioning rehearsals: 20-bed flat electricity, 80-bed manual electricity, and 200-bed shared meters.
3. Tenant accounts and complete tenant PWA.
4. Deposits, move-out settlement, complaints, notices, electricity modes, reports, retention, and downloadable branded receipts.
5. WhatsApp Cloud API connections, verified/deduplicated webhooks, transactional outbox, retries/dead letters, consent, English/Hindi templates, reminders, and digests.
6. Logo/PWA assets and custom-domain verification/TLS.
7. Accessibility, browsers/mobile, security, DPDP/legal, backups/restore, incident response, load, and timed-provisioning gates.

## Non-negotiable security rules

- Never commit `.env.local`, `.vercel`, service-role keys, passwords, payment tokens, UTRs, screenshots, real phones, or tenant data.
- Keep service-role and trusted RPC access server-only.
- Resolve tenancy from an approved hostname plus authenticated membership; never trust caller-provided organization IDs, roles, or raw hostnames.
- Keep every business operation organization-qualified and property-qualified where applicable.
- Approved financial records use audited reversals, never deletion.
- Never auto-approve screenshots or UTRs.
- Do not weaken RLS or grants to make tests pass.
- Do not modify hosted data, migrations, domains, Vercel variables, Git history, or merge/deploy without explaining the action and receiving appropriate user authorization.

## User collaboration style

The user is new to development. Before every action, explain simply what will happen, whether it changes local files or cloud state, and why. Avoid asking the user to run commands when the developer can safely do them. Never reveal or repeat secrets.


# PGFlow template

> Continuing in Cursor? Start with [`docs/CURSOR_HANDOFF.md`](docs/CURSOR_HANDOFF.md) for the current branch, deployment state, locked decisions, active CI failure, and exact next task.

PGFlow is a reusable, white-label, WhatsApp-first PG-management product template. It supports only direct UPI and staff-recorded cash—never Razorpay or another payment gateway.

The repository has two deliberately separate runtimes:

- Canonical production track: Next.js + Supabase PostgreSQL/Auth/private Storage + Vercel.
- Fictional sales demo: Vinext + synthetic data, with real payments and messaging disabled.

## Run the fictional demo

Requires Node.js 22.13 or newer.

```bash
npm install
npm run demo:dev
```

Open `http://localhost:3000` and explore:

- `/` — owner/staff action centre
- `/collections` — invoices, evidence, cash, receipts, and reversal states
- `/residents` — resident and occupancy workspace
- `/rooms` — room/bed state model
- `/operations` — complaints, notices, and move-outs
- `/reports` — organization-scoped reporting previews
- `/settings` — branding, UPI, reminders, domains, and integration boundaries
- `/tenant` — installable tenant PWA experience
- `/pay/INV-DEMO-0726` — financially inert payment-request demonstration
- `/operator` — fictional operator-workflow preview
- `/presentation` — curated sales presentation

The demo runtime is explicit (`PGFLOW_RUNTIME=demo`). It has no production credentials, real payments, or real messages. All names, phone numbers, UTRs, money, organizations, and health states are synthetic.

## Run the production application locally

Production development requires Docker, the Supabase CLI, and an ignored `.env.local` based on `.env.example`.

```bash
supabase start
supabase db reset
supabase test db
npm run dev
```

Use the local API URL, publishable key, and service-role key reported by Supabase. Never expose the service-role key through a `NEXT_PUBLIC_` variable. `npm run dev` uses the canonical Next.js runtime and does not enable demo actors.

See `docs/PRODUCTION_SETUP.md` for the complete environment and security boundary.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run demo:build
npm run db:generate
supabase test db
```

Run `npm run demo:start` in another terminal before `npm run test:rendered`, or set `TEST_BASE_URL` to another fictional demo deployment. GitHub CI runs the standard Next.js build, unit/security contracts, production-dependency audit, migrations, and pgTAP RLS suite.

## Architecture boundary

`npm run dev`, `build`, and `start` use standard Next.js. `supabase/migrations` is the production schema and RLS source of truth.

The Codex Sites preview remains a separate Vinext demonstration, invoked only through the `demo:*` scripts. `db/schema.ts` is its synthetic preview track. The hosted demo does not claim live persistence, WhatsApp delivery, provisioning, or the four-hour SLA.

## Template and demo separation

- `lib/template.ts` contains `BLANK_TEMPLATE`, with no rooms, residents, payments, branding, or credentials.
- The same file deterministically generates the canonical fictional Nivasa seed: 3 floors, 24 rooms, 60 beds, and 48 fictional residents.
- `/api/demo/reset` exposes only a protected reset preview.
- Demo payment QR codes contain a non-payment marker, never `upi://pay` or a valid VPA.

## API safety

In the production runtime, protected APIs derive the user from `supabase.auth.getUser()`, the organization from a verified hostname mapping, and the role from an active membership. Caller-provided organization or role headers and shared action tokens are not accepted. Synthetic bearer roles exist only when `PGFLOW_RUNTIME=demo`.

Copy `.env.example` to a local ignored environment file only when connecting real providers. Never expose `SUPABASE_SECRET_KEY` or Meta secrets to browser code.

## Onboarding

The standard CSV package lives in `onboarding/`. Validation must pass and the owner must confirm imported totals before the four-working-hour handoff clock begins. Imports must stage and commit transactionally; these sample files never write directly to operational tables.

## Production gates

The production foundation now includes lazy Supabase clients, cookie refresh, a real phone/password operator login/logout flow, verified membership resolution, server-only platform operators, database-backed hostname resolution and branding, private Storage policies, explicit grants, CI, and a multi-role pgTAP isolation suite. The protected operator console can persist an idempotent blank PG shell and issue a one-time manual owner credential whose readable value is shown only once. Owner activation creates the Auth user with the owner’s final private password and grants membership only after the temporary credential is re-verified; it requires no SMS OTP provider. Public authentication is database-throttled, owner-credential actions require the operator's current password, active owners can change their password, and a manually verified one-time recovery flow closes prior sessions.

Before accepting a real PG, still complete and verify:

1. Run controlled staging activation, password-change, and lost-password recovery exercises using an approved test phone before any real owner is onboarded.
2. Extend RLS and private Storage tests across every remaining domain table.
3. Implement one persisted invoice → evidence → approval → allocation → receipt → reversal transaction.
4. Extend the working blank-shell and manual owner activation stages with staged imports, step retry/recovery, and three synthetic PG rehearsals.
5. Add uploaded logos, receipt branding, and custom-domain operations to the working per-host brand system.
6. Persist/deduplicate WhatsApp webhooks and add outbox retries, consent, and templates.
7. Complete backup/restore, privacy/legal, accessibility, load, and timed-provisioning gates.

See `docs/IMPLEMENTATION_STATUS.md` and `docs/RUNBOOKS.md` for the truthful release boundary and operating procedures.

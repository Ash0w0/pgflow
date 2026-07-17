# PGFlow template

PGFlow is a reusable, white-label, WhatsApp-first PG-management product template. The repository currently delivers a polished fictional demonstration, versioned domain contracts, onboarding formats, data schemas, and integration-safe API boundaries. It supports only direct UPI and staff-recorded cash—never Razorpay or another gateway.

## Test the product

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
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
- `/operator` — public fictional operator-workflow preview
- `/presentation` — curated sales presentation

The demo is deliberately unable to send WhatsApp messages or initiate UPI payments. All names, phone numbers, UTRs, money, organizations, health states, and timings are synthetic. Local action buttons simulate UI state only.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:full
npm run db:generate
```

`npm run test:full` creates the Cloudflare-compatible deployment build, runs domain/security tests, and exercises the principal routes against the running local preview. Keep `npm run dev` running in another terminal, or set `TEST_BASE_URL` to another test deployment.

## Architecture boundary

The approved production architecture remains Next.js + Supabase PostgreSQL/Auth/private Storage + Vercel Mumbai. `supabase/migrations` is the production schema/RLS track.

This Codex Sites preview uses Vinext + Cloudflare D1/R2 so it can be hosted as a self-contained demonstration. `db/schema.ts` and `.openai/hosting.json` are the preview persistence track. The two schemas must converge before a pilot; the current public demo does not claim live persistence, real authentication, verified RLS isolation, WhatsApp delivery, provisioning, or the four-hour SLA.

## Template and demo separation

- `lib/template.ts` contains `BLANK_TEMPLATE`, which has no rooms, residents, payments, branding, or credentials.
- The same file deterministically generates the canonical fictional Nivasa seed: 3 floors, 24 rooms, 60 beds, and 48 fictional residents.
- `/api/demo/reset` exposes only a protected reset preview. It refuses to claim that a database reset occurred until transactional persistence is connected.
- Demo payment QR codes contain a non-payment marker, never `upi://pay` or a valid VPA.

## API safety

Mutating APIs fail closed without a server-side actor or operator credential. Development-only bearer roles are available to automated tests (`demo-tenant`, `demo-owner`, `demo-manager`, `demo-accountant`, `demo-operator`) and are rejected when `NODE_ENV=production`.

Copy `.env.example` to a local ignored environment file only when connecting real providers. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_API_KEY`, `APP_ACTION_TOKEN`, or Meta secrets to browser code.

## Onboarding

The standard CSV package lives in `onboarding/`. Validation must pass and the owner must confirm imported totals before the four-working-hour handoff clock begins. Imports must stage and commit transactionally; these files never write directly to operational tables.

## Production gates

Before accepting a real PG, complete and verify:

1. Supabase phone/password authentication and server-verified role claims.
2. Tenant-specific RLS tests for every table and private storage bucket.
3. One persisted invoice → evidence upload → manual approval → allocation → numbered receipt → reversal vertical slice.
4. Idempotent import/provisioning with three synthetic PGs.
5. Approved-hostname brand/PWA resolution.
6. Durable WhatsApp webhook storage, deduplication, outbox retries, consent, and templates.
7. Backup/restore drill, privacy/legal review, accessibility audit, and timed provisioning rehearsal.

See `docs/IMPLEMENTATION_STATUS.md` and `docs/RUNBOOKS.md` for the truthful release boundary and operating procedures.

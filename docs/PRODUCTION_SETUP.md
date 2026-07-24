# Production foundation setup

This document configures the canonical Next.js + Supabase application. It does not make the product pilot-ready by itself; the ledger, provisioning, WhatsApp, and release gates in `IMPLEMENTATION_STATUS.md` remain mandatory.

## Environments

Use separate Supabase projects for local development, staging, and production. Never reuse real tenant data, Meta credentials, phone numbers, UTRs, or screenshots in local development or staging.

| Variable | Exposure | Purpose |
|---|---|---|
| `PGFLOW_RUNTIME` | Server | `production` for the canonical app; `demo` only for the fictional preview |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe | RLS-bound publishable key |
| `SUPABASE_SECRET_KEY` | Server secret | Operator, hostname, and trusted transaction services |
| `NEXT_PUBLIC_PLATFORM_DOMAIN` | Browser-safe | Wildcard platform domain |
| `OPERATOR_HOSTNAME` | Server | Dedicated operator-console hostname; operator APIs reject every other host |
| `WHATSAPP_VERIFY_TOKEN` | Server secret | Meta webhook challenge |
| `WHATSAPP_APP_SECRET` | Server secret | Meta webhook signature verification |
| `NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER` | Public | PGFlow onboarding number used by `/signup`, in international digits only |

The service-role key bypasses RLS. It must stay in server-only modules and encrypted environment variables. Never log it, return it, or prefix it with `NEXT_PUBLIC_`.

## Local setup

1. Install Node.js 22.13+, Docker Desktop, and the Supabase CLI.
2. Copy `.env.example` to `.env.local` and use the local keys printed by Supabase.
3. Start and recreate the local database:

   ```bash
   supabase start
   supabase db reset
   ```

4. Run the RLS suite:

   ```bash
   supabase test db
   ```

5. Start the production runtime locally:

   ```bash
   npm run dev
   ```

6. Confirm `/api/health` reports `ready`. An absent or partial Supabase configuration must fail, and protected APIs must remain closed.

## First operator

For the first staging operator only, temporarily add these values to the ignored `.env.local` file:

```dotenv
BOOTSTRAP_OPERATOR_PHONE=+91XXXXXXXXXX
BOOTSTRAP_OPERATOR_PASSWORD=use-a-unique-password-of-at-least-12-characters
BOOTSTRAP_OPERATOR_NAME=Your Name
```

Then run:

```bash
npm run operator:bootstrap
```

Remove all three `BOOTSTRAP_OPERATOR_*` values from `.env.local` immediately after the command succeeds. The command does not print the phone or password, refuses to overwrite an existing Auth account, and refuses to create a second active operator. Future operators must be added through an audited operator workflow.

Before production, use a normal verified phone activation flow and enable operator MFA. Do not create a shared operator password or API token.

Operator access is intentionally unavailable through client RLS. The server validates the Supabase user, then checks the operator registry with the server-only service role. Every future support action must also create an audited, time-limited support session.

## Domain and organization rule

Every production request resolves its organization from `domain_mappings.hostname` where `state = 'verified'`. The user must also have an active membership in that same organization. A request header or body field can never select the organization.

Unknown, pending, failed, suspended, and archived hostnames do not receive an operational tenant context. The wildcard platform subdomain remains independent of optional custom-domain verification.

For the hosted PGFlow environment, use:

```dotenv
NEXT_PUBLIC_PLATFORM_DOMAIN=pgflow.co
OPERATOR_HOSTNAME=admin.pgflow.co
```

Attach both `*.pgflow.co` and `admin.pgflow.co` to the production Vercel project. The apex can redirect to `www.pgflow.co`. Its `/login` page is only a workspace locator: it navigates the browser to `<organization-slug>.pgflow.co/login`, where normal hostname-based tenant resolution and authorization still apply. Each provisioned organization gets one hostname such as `your-pg.pgflow.co`, derived from its unique organization slug. Customers do not need to buy a domain unless they want to bring an optional custom domain of their own.

Migration `0031_cut_over_platform_domain.sql` replaces the temporary `pgflow-ruby.vercel.app` tenant mapping with `<organization-slug>.pgflow.co`. Apply it to the production Supabase project before retiring the old hostname.

## Release checks for this slice

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
npm run demo:build
```

The SQL isolation tests require a running Supabase stack and are also enforced by `.github/workflows/ci.yml`.

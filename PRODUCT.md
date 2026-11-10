# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

PGFlow is primarily for Indian paying-guesthouse owners and operators who need one place to manage rent, residents, rooms, payments, staff work, and everyday communication.

Secondary users are:

- owner-authorized managers and accountants;
- residents using secure payment links and WhatsApp-led service flows;
- PGFlow platform operators supporting onboarding, recovery, and upgrades.

## Product Purpose

PGFlow gives each PG its own branded operational workspace and subdomain. Owners can organize residents and beds, generate and review rent activity, record direct UPI or cash payments, manage operational work, and communicate through WhatsApp-oriented flows.

Success means a PG owner can start operating without assembling separate spreadsheets, payment trackers, reminder tools, and resident-support systems.

## Positioning

PGFlow is the WhatsApp-first operating system for PGs: a production web workspace behind each PG, with everyday resident and owner actions flowing through familiar WhatsApp conversations and secure focused links.

Unlike a generic property dashboard, PGFlow is white-labelled per PG and is built around Indian PG workflows, direct UPI, staff-recorded cash, manual payment-proof review, rooms and beds, resident lifecycle, and bilingual communication.

## Operating Context

- Owners and staff work from a web dashboard.
- Residents primarily encounter PGFlow through WhatsApp messages and secure task-specific links.
- Every PG receives its own platform subdomain and brand context.
- Direct UPI and staff-recorded cash are supported; PGFlow does not present itself as a payment gateway.
- Payment proof is evidence and must be reviewed before a receipt is issued.
- PG upgrades and sales support should happen through WhatsApp.

## Capabilities and Constraints

- The public apex domain is a business homepage.
- Existing customers open their organization from `/login` or their PG-specific subdomain.
- The public product identity is PGFlow. Former fictional property identities must not appear in the production marketing or onboarding journey.
- New owners should be able to create their own PG from a public signup flow.
- A new PG may start with up to two tenants. Adding more than two tenants requires an upgrade through PGFlow support on WhatsApp.
- The two-resident entitlement is enforced at the database boundary, and signup begins through a reviewed WhatsApp handoff. Fully automatic self-service organization creation and in-product paid upgrades are not yet live.
- The public WhatsApp sales number remains an environment-configured deployment value; no personal number should be committed to source.
- Pricing is yearly and decided, but it is shared only on calls and in demos, never on the public site or in this public repo (founder decision, Nov 2026). Founding PGs: first 10, price locked for 2 years, 30-day money-back.
- The public homepage is demo-led: the primary action books a demo on WhatsApp; self-serve signup remains available as a fallback.
- Do not invent customers, testimonials, operational benchmarks, pricing, or delivery guarantees.
- Marketing claims must distinguish implemented capabilities from roadmap work.

## Brand Commitments

- Product name: PGFlow.
- Core promise: “Your PG, beautifully run.”
- Positioning language: WhatsApp-first PG operations.
- Existing forest-green and lime identity remains the visual authority.
- Each customer PG can inherit the system while expressing its own name, initial, and brand context.
- The public voice is confident, operational, plain-spoken, and trustworthy—not demo-like, speculative, or hype-driven.

## Evidence on Hand

- A working production domain and tenant subdomain routing.
- Production-backed owner/staff authentication and organization-scoped data boundaries.
- Implemented room/bed setup, resident onboarding, monthly rent generation, invoice registers, direct UPI configuration, staff-recorded cash, payment-proof review, payment links, receipts, and reversals.
- WhatsApp message infrastructure, secure WhatsApp draft sharing, and workflow code in the repository; every public claim must still match the deployed configuration.
- Existing product UI and PG-specific branding components in the repository.
- No approved customer testimonials, customer logos, or verified outcome benchmarks are currently available. Pricing is kept off the public site by founder decision.

## Product Principles

1. WhatsApp is the front door; PGFlow is the system of record.
2. Money remains reviewable and auditable—proof never becomes payment automatically.
3. Each PG feels like its own workspace without fragmenting the platform.
4. A new owner should reach useful operation quickly and understand the starter boundary before adding a third resident.
5. Public claims stay truthful to deployed production behavior.

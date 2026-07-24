# Design

<!-- impeccable:design-schema 1 -->

## Creative North Star

**The WhatsApp Operations Relay**

PGFlow should feel like a calm, trustworthy control room where a familiar WhatsApp action becomes an organized operational record. The public homepage makes that relay visible: a resident message or payment action moves into a focused owner decision, then becomes a clean ledger, receipt, room update, or follow-up.

The interface should feel distinctly Indian and operational without using cultural decoration, stock-property photography, or generic SaaS spectacle.

## Visual Authority

The existing PGFlow product interface is the authority. The homepage should look like the same product stepping into a public, persuasive mode—not a separate marketing theme.

## Palette

- **Forest / primary:** `#123d32`
- **Deep forest:** derived darker forest for high-contrast surfaces
- **Lime / action:** `#d7ff86`
- **Warm off-white / page:** `#f4f7f2`
- **White / surface:** `#ffffff`
- **Muted green-grey / secondary surfaces:** `#edf2ed`
- **Ink:** `#12231f`
- **Secondary ink:** `#53645f`
- Status colors remain functional and restrained.

Forest carries trust and structure. Lime identifies one primary action or live handoff at a time. Avoid broad neon washes, purple/blue SaaS gradients, and decorative color proliferation.

## Typography

- Geist is the primary face; Geist Mono is reserved for operational identifiers and small system details.
- Headlines are compact, confident, and tightly tracked.
- Body copy is plain-spoken, with short lines and generous leading.
- Use sentence case. Avoid slogan overload, all-caps paragraphs, or speculative superlatives.

## Material and Shape

- Surfaces are crisp white or softly tinted, with thin green-grey borders.
- Corners are rounded but not pill-shaped by default.
- Shadows are low-opacity and broad, used to separate working layers rather than to create floating decoration.
- Product frames, message cards, ledgers, and workflow rails are the signature visual material.
- Icons should come from the existing Lucide set.

## Composition

- The homepage is video-first: the embedded Remotion workflow is the primary evidence, not a decorative background.
- The opening viewport balances a compact promise and two clear actions with a dominant product workflow stage.
- Subsequent sections unpack the same relay across WhatsApp, owner operations, and resident actions.
- Prefer asymmetric editorial grids with clear alignment over repetitive equal-card galleries.
- No customer-logo strips, testimonials, metrics, or social proof until real approved evidence exists.

## Approved Homepage Direction

The approved direction combines **Workflow Theatre** with **Three-role Relay**:

- a compact, centered promise and two actions introduce the page;
- a large 16:9 Remotion theatre dominates the opening experience;
- the film follows a resident action into WhatsApp, through owner review, and into an auditable PGFlow record;
- the next section explains the same system for owners, staff, and residents using an editorial relay rather than a generic feature-card grid;
- the traveling lime signal is the single connective signature across the film and the surrounding page.

The generated concept is not a literal screenshot specification. Do not reproduce its fictional PG names, customer data, unsupported security claims, pricing navigation, or invented metrics. Final product surfaces, copy, controls, responsive behavior, and accessibility remain semantic code.

### Implementation Inventory

- **Homepage structure, navigation, copy, actions, and role sections:** semantic React and CSS.
- **Workflow film:** Remotion React composition embedded with the Remotion Player.
- **WhatsApp, secure-link, owner-review, rooms, residents, and ledger surfaces:** code-native UI inside the composition.
- **Icons:** the existing Lucide icon library.
- **Photography or generated raster assets:** none required.
- **Audio:** intentionally omitted; the story remains understandable from visible text.
- **Reduced-motion experience:** an immediately legible static film frame with playback kept user-controlled.

## Product Imagery

- Use code-native product UI, messages, payment-review states, rooms, residents, and activity records.
- Do not introduce a fictional customer identity into the public product story.
- Use role labels and neutral sample data only where a workflow cannot be understood without it.
- Avoid glossy phone mockups, stock photos of buildings or people, and fake chat screenshots.

## Motion Grammar

- Motion explains handoff and state change: message arrives, task focuses, owner approves, record settles.
- Use staged reveals, short directional slides, gentle scale emphasis, and a single traveling lime signal to connect steps.
- Respect reduced-motion preferences on the web.
- No ambient looping movement without informational purpose; no springy novelty motion for financial states.

## Voice

- Confident, operational, specific, and trustworthy.
- Lead with what the owner can do, then explain how WhatsApp fits.
- Say “review payment proof” instead of implying automatic settlement.
- Say “secure link” instead of “tenant app” when the resident experience is link-based.
- Calls to action use direct verbs: “Create your PG,” “Open your workspace,” “Talk to PGFlow.”

## Accessibility and Quality Floor

- Text contrast meets WCAG AA.
- Interactive targets are at least 44px high.
- Focus states are visible.
- The Remotion player has an accessible label, controls, captions expressed as visible text, and a meaningful static fallback.
- Layout works at 320px without horizontal overflow.
- The public page remains legible and useful if motion is disabled.

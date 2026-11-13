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

- The homepage tells one story: the paper rent register and the 1st-of-the-month WhatsApp chase becoming one calm screen.
- Asymmetric, editorial layouts. Avoid centered hero stacks, repeated icon-card grids, and an eyebrow label above every heading.
- Product evidence is code-native and live (animated UI), never a decorative video background.
- No customer-logo strips, testimonials, metrics, or social proof until real approved evidence exists. Sample figures are labelled as samples.

## Approved Homepage Direction (Nov 2026 rebuild): "The Register, Out of the Drawer"

The previous Remotion film and generic section stack were retired. The page follows the owner's month:

1. **Hero: the live relay.** A short, human promise ("Every rupee of rent, accounted for.") beside a live, looping scene: reminder on WhatsApp, resident pays the PG's own UPI, owner checks the proof, receipt goes back and the ledger row settles. One lime signal travels between the steps. Steps are clickable and pause the loop.
2. **"You know this day."** A scroll-scrubbed 1st of the month: real-sounding Hinglish messages pile up ("Kal pakka de dunga", "Cash Raju bhaiya ko diya tha"), then fold into one tidy, labelled sample status board.
3. **How it works.** Three acts (Send, Review, Record) with a sticky product panel that changes as each act scrolls into view.
4. **Your register, upgraded.** A draggable before/after: a handwritten paper register page against the PGFlow ledger.
5. **What is slipping through.** The leak calculator as a live meter with a counting number.
6. **Who sees what.** Owner, manager and resident as three access passes with "can" and "can't" lists that match the product.
7. **Things PGFlow will never do.** Plain promises with large numerals: never hold your money, never approve a screenshot for you, never message residents without your say, never lock you in, never mix PGs.
8. **The founder letter.** A paper letter with a hand-drawn signature, set slightly off-axis.
9. **Founding PGs.** Ten numbered beds for ten founding spots (filled only from the configured spots-left value).
10. **FAQ** and a **closing WhatsApp composer** that types the demo request and sends it on click.

### Type for the homepage

- Geist is the only typeface for text, including headlines. Emphasis within a headline uses a medium weight in mid forest green (`#2d7a62`), or lime on dark sections, never a second font. **Caveat** is used only for handwriting inside the paper register and the signature. (Instrument Serif was tried and retired in Nov 2026 for readability.)

### Motion

- Built with `motion/react`. Motion always explains a state change (message arrives, proof checked, record settles) or follows scroll.
- `prefers-reduced-motion` shows every scene in its final, readable state with no movement.

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
- Animated scenes have text equivalents, user-controllable steps, and a complete static state for reduced motion.
- Layout works at 320px without horizontal overflow.
- The public page remains legible and useful if motion is disabled.

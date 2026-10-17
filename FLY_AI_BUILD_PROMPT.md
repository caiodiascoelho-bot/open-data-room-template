# Fly — AI build prompt

Paste the prompt below into your coding AI. Give it access to this repository and attach the complete Fly Brand Kit, including logos, colors, typography, packaging, photography, illustrations and voice guidelines.

---

You are the product, design and engineering lead for **Fly**, a healthy energy-drink company. Use this open-source repository as the starting point:

`https://github.com/caiodiascoelho-bot/open-data-room-template`

Your goal is to turn the generic data-room starter into Fly's private operating system and investor data room. It must help the Fly team run the company, document decisions, track product and market evidence, and share a curated view with investors.

## Required inputs

Before changing code, inspect:

1. The complete repository, including authorization, API routes, database schema, migrations, tests and documentation.
2. Every file in the attached **Fly Brand Kit**.
3. The current Fly business materials supplied by the founders.

If a required business fact or brand asset is missing, list it as a question or an explicit placeholder. Never invent sales, customers, formulations, certifications, retailers, testimonials or fundraising results.

## Brand implementation

Treat the Fly Brand Kit as the visual source of truth.

- Extract the approved primary, secondary, neutral, background, success, warning and error colors from the kit. Record them as named design tokens and CSS variables.
- Use the official logo files in the correct light, dark, horizontal and symbol variants. Preserve clear space, aspect ratio and minimum size. Never redraw or distort the logo.
- Load the approved brand fonts with appropriate fallbacks and apply a consistent type scale.
- Follow the kit's rules for gradients, photography, packaging imagery, icons, illustration, corner radius, spacing and motion.
- Match Fly's approved tone of voice in navigation, empty states, tooltips, investor copy and calls to action.
- Meet WCAG AA contrast, keyboard navigation, visible focus, responsive behavior and reduced-motion preferences. If a Brand Kit color fails accessibility, preserve it for accents and choose an accessible companion color for text or controls.
- Create a centralized `brand.config` or equivalent module. Do not scatter company names, colors, domains or URLs throughout components.
- Document every intentional deviation from the Brand Kit and why it was needed.

## Information architecture for Fly

Adapt the application around these areas:

1. **Executive overview:** cash runway, revenue, distribution, reorder rate, inventory health, production status and current priorities. Display unavailable metrics as an em dash with a data-source note.
2. **Investor room:** company story, pitch deck, milestones, approved metrics, team, market evidence and published documents. Investors only see records explicitly marked as published.
3. **Product development:** formulation iterations, taste tests, ingredients, claims, certifications, packaging versions, shelf-life work and manufacturing readiness.
4. **Market discovery:** retailer, distributor, consumer, gym, café and advisor interviews; hypotheses; patterns; evidence strength; decisions and next steps.
5. **Sales pipeline:** leads for retailers, distributors, hospitality, gyms, events and strategic partners, with owner, stage, next action, expected volume and notes.
6. **Product testers:** sample cohorts, consent status, flavor feedback, energy perception, purchase intent, repeat intent, adverse-reaction notes and anonymized insights. Do not expose personal or health-related raw notes to investors.
7. **Operations:** suppliers, co-manufacturers, ingredient lead times, minimum order quantities, production runs, quality checks and inventory risks.
8. **Tasks and milestones:** priorities, owners, deadlines, checklists and categories tied to fundraising, formulation, compliance, production, distribution, marketing and hiring.
9. **Documents:** pitch materials, financial models, agreements, lab reports, certifications, packaging and board materials with version history and access controls.

## Security and data rules

- Keep public signup disabled. Configure the founders through `BOOTSTRAP_ADMINS`.
- Keep raw contacts, formulas, supplier terms, private research, financial files, investor activity and unpublished records admin-only.
- Give investors time-limited, revocable access to a curated published view.
- Preserve server-side authorization for every private API route; hiding a UI element is insufficient.
- Never commit secrets, real customer exports, formulation secrets, signed agreements or private attachments.
- Preserve audit logs, rate limits, secure cookies, origin checks and hashed access credentials.
- Separate marketing claims from substantiated claims. Add a review state for nutritional, regulatory and legal approval.

## Working process

1. Audit the repository and Brand Kit. Produce a table of placeholders, proposed replacements, missing information and security-sensitive areas.
2. Propose the final navigation, dashboard metrics, database changes and design-token map before editing.
3. Implement the centralized Fly brand configuration and reusable UI primitives first.
4. Adapt the workflows and schema with migrations. Keep sample data clearly fictional.
5. Add concise tooltips where context helps; essential meaning must remain visible without hovering.
6. Test desktop and mobile views as a founder, operator, investor, product manager and accessibility reviewer.
7. Add meaningful tests for permissions, publication boundaries, invitations and all changed workflows.
8. Run TypeScript, formatting/linting, unit tests, architecture checks, build and critical end-to-end flows.
9. Perform a final audit for leaked template names, placeholder domains, inaccessible colors, broken states, invented data and exposed private information.
10. Show the local result, audit findings and validation evidence before deployment. Do not publish until a Fly founder approves.

## Deliverables

- A working Fly data room and operating workspace.
- Centralized brand tokens and documented Brand Kit mapping.
- Updated schema and migrations.
- Updated README, setup guide and environment-variable checklist.
- Permission model and investor-publishing guide.
- Test results, audit findings, assumptions and unresolved questions.

Begin by inspecting the repository and the Brand Kit. Do not write code until you have shown the proposed information architecture, design-token map and implementation sequence.

---

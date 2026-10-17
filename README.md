# Open Data Room

A secure, open-source startup data-room starter for founders, teams and invited investors. It includes a private operating workspace, an investor-facing published view, documents, tasks, traction, market discovery, outreach CRM, milestones, product tester research and activity auditing.

This repository contains **no production credentials, customer records, company-specific documents or private research data**. The sample names and domains are placeholders.

## What is included

- Invitation-only administrator accounts; public signup is disabled.
- Time-limited or revocable investor access.
- Published/private separation for interviews, theses, events and documents.
- Market discovery Kanban with outreach contacts, conversations, patterns and decisions.
- AI-assisted research brief with a transparent non-AI fallback.
- Product tester CRM and usage analytics.
- Tasks with priorities, notes, checklists and categories.
- Metrics, milestones, pitch deck and document versioning.
- Audit log, rate limits, secure cookies, origin validation and hashed credentials.
- Cloudflare D1 and R2 storage, with a Next.js-compatible React interface.

## Quick start

Requirements: Node.js 22.13 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run build
node scripts/prepare-e2e.mjs
npm run dev
```

Open `http://127.0.0.1:5173`.

`BOOTSTRAP_ADMINS` accepts comma-separated `email:name` entries, for example:

```text
BOOTSTRAP_ADMINS=founder@yourcompany.com:Founder,partner@yourcompany.com:Partner
```

Call `POST /api/bootstrap` once with `Authorization: Bearer <BOOTSTRAP_SECRET>`. It returns one-time activation links for configured administrators. Remove or rotate the bootstrap secret after setup.

## Configure the template

1. Read [CUSTOMIZE_WITH_AI.md](CUSTOMIZE_WITH_AI.md).
2. Replace the sample brand assets in `public/brand/`.
3. Update company language, navigation and URLs in `components/data-room/workspace.tsx`.
4. Set the deployment secrets listed in `.dev.vars.example`.
5. Apply every migration in `drizzle/meta/_journal.json` in order.
6. Run the verification commands below.
7. Deploy to a new Cloudflare project with its own D1 database and R2 bucket.

## Verification

```bash
npm run typecheck
npm run quality
npm test
npm run build
npm run arch-contract
```

## Security notes

- Never commit `.dev.vars`, database exports, interview transcripts, uploaded PDFs or analytics exports.
- Do not use this template as proof of regulatory compliance.
- Review access control, retention, backups, logging and vendor agreements for your own business and jurisdiction.
- Investor content must be explicitly published; private notes and outreach contacts remain admin-only.

See [SECURITY.md](SECURITY.md) for reporting and deployment guidance.

## License

MIT. See [LICENSE](LICENSE).

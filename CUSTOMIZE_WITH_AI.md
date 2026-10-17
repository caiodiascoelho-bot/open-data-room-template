# Prompt: customize this Data Room for my company

Copy the prompt below into your coding AI while the repository is open.

---

You are adapting the open-source **Open Data Room** repository for my company. First inspect the complete codebase, database schema, API routes, authorization rules, tests and migration history. Do not remove security controls just to simplify implementation.

My company information:

- Company name: `[COMPANY NAME]`
- Website: `[DOMAIN]`
- Product URL: `[PRODUCT URL OR NOT YET AVAILABLE]`
- Admin URL: `[ADMIN URL OR NOT YET AVAILABLE]`
- Industry: `[INDUSTRY]`
- Stage: `[IDEA / MVP / REVENUE / FUNDRAISING]`
- Founders and roles: `[NAMES AND ROLES]`
- Brand colors: `[HEX VALUES]`
- Fonts: `[FONT NAMES]`
- Logo files: `[PATHS]`
- Primary investor audience: `[AUDIENCE]`
- Metrics that matter: `[METRICS]`
- Market-discovery workflow: `[HOW WE RESEARCH]`
- Product tester workflow: `[HOW WE TEST]`
- Deployment provider: `[PROVIDER]`

Work in this order:

1. Audit the repository and list every placeholder, sample domain and generic label that must change.
2. Propose the final information architecture before editing.
3. Create a centralized brand/config module so company name, domains and navigation are not scattered through the code.
4. Replace the sample visual identity while preserving contrast, keyboard access, responsive behavior and reduced-motion support.
5. Adapt dashboard metrics to our actual business. Show an em dash when data is unavailable; never invent traction.
6. Adapt Market Discovery, outreach CRM, tasks, milestones and product tester research to our workflow.
7. Keep raw contacts, interview notes, documents, tasks and tester analytics admin-only. Investors may only see explicitly published sanitized records.
8. Configure administrator bootstrap through `BOOTSTRAP_ADMINS`; never create public signup or default passwords.
9. Configure integrations only after documenting their authentication, failure behavior and data boundaries.
10. Create or update migrations. Do not edit production data manually.
11. Add meaningful tests for every changed permission boundary and workflow.
12. Run TypeScript, formatter/linter, unit tests, architecture checks, build and critical end-to-end flows.
13. Review the result as a founder, investor, product manager, security reviewer and mobile user. Fix the issues found.
14. Before deployment, show me the local version and a concise change report. Do not publish until I approve.

Constraints:

- Never commit secrets, real customer data, interview exports or uploaded private documents.
- Never claim compliance, customers, revenue or integrations that have not been verified.
- Preserve server-side authorization on every private API endpoint.
- Prefer clear, calm interfaces with progressive disclosure over dense dashboards.
- Tooltips must supplement visible labels, not replace essential instructions.
- Every unavailable integration must be labeled as planned, disconnected or not configured.

Deliverables:

- Customized application.
- Updated README and deployment guide.
- Environment-variable checklist.
- Migration notes.
- Test and audit results.
- List of assumptions and remaining decisions.

---

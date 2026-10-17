# Security policy

Please report vulnerabilities privately to the repository owner rather than opening a public issue with exploit details.

This starter provides security-oriented defaults, including invitation-only administration, server-side authorization, origin checks, rate limiting, hashed credentials, private document storage and published/private content boundaries. Security still depends on correct deployment, secrets, vendor configuration, operational procedures and ongoing review.

Before production use:

- rotate all secrets and use separate development and production resources;
- review every administrator and investor access path;
- configure backups, retention, monitoring and incident response;
- run dependency, static-analysis and penetration testing;
- verify email delivery and account recovery;
- execute the authorization and document-isolation tests;
- obtain professional advice for regulated or sensitive data.

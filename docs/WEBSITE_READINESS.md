# Website readiness changes

This release is based on main at a6e5fad and deliberately preserves the current database and image-processing deployment contract.

## Included

- Explicit admin guards on client, invoice, payment, settings, task, and managed QR mutations; canonical owner on secret-key client creation.
- Private/no-store file redirects and disabled remote image optimization for signed storage URLs.
- Next.js 16.3.5 and Sharp 0.35.4, with locked dependencies and automated lint, type, rendering, payload, and browser checks.
- Bounded multipart parsing, client-side combined-size checks, response-size checks, and decoded-image limits. Direct exports currently have a conservative 4 MB request/output ceiling; preview selection limits are separate. This prevents opaque platform errors; it does not enable large-file exports.
- Public design/packaging metadata, canonical URLs, crawlable robots/sitemap routes, a semantic homepage heading, and a services/portfolio section below the existing order card.
- Gallery keypads wait for hydration before accepting input.

## Remaining coordinated rollout (PR #3)

The complete gallery/private-storage and queued-processing implementation remains on security/six-priorities. Do not deploy that branch as a drop-in replacement: it needs new gallery configuration, database migrations, checksum-verified private asset transfers, and a running worker. Enabling its application routes before infrastructure is ready locks galleries and disables exports.

The connected Supabase account available during this release did not expose the website project identified in next.config.ts at the original main revision. No production SQL, bucket configuration, asset transfer, or worker deployment was performed.

Remaining work:

1. Finish PR #3 integration verification and resolve any failures without weakening role/storage assertions.
2. Verify the website Supabase project and isolated staging identity. Reconcile live RLS/function grants and workspace admins before applying migrations.
3. Validate private-gallery transfers, codes, signed sessions, and authorized/denied downloads.
4. Provision and profile the worker, exercise large files and failure recovery, then coordinate application/database/storage cutover using PR #3's docs/SECURITY_ROLLOUT.md.

Existing shared gallery passcodes/legacy cookies and production database grants are not declared fixed by this release. Signed-cookie code alone cannot make publicly accessible source assets private. PR #3 retains source files pending verified transfer; public Git history requires separate remediation if those assets must be confidential.

## Verification

Local: production build, TypeScript, zero-warning lint, five focused rendering/payload tests, and production dependency audit (zero vulnerabilities). GitHub Actions runs the browser suite and preserves desktop/mobile homepage screenshots. Check the exact release commit's Actions run for the final CI result.

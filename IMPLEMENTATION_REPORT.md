# Security and reliability implementation report

Implementation date: September 16–17, 2026. Branch: `security/six-priorities`.
Inspected HEAD is the audited commit `7d772dfaf41f31194a4ffea18719eb16ebd61434`; findings were rechecked against actual files and resolved dependencies. Existing edits to `CLAUDE.md` and untracked `ARCHITECTURE_AUDIT.md` were preserved. No commits, pushes, production queries, migrations, asset transfers/deletions, history rewrites or deployments were performed.

## Validation update — September 17, 2026

The requested Docker-backed and remote validation was attempted again from this branch. Docker is not installed on this machine (`docker: command not found`), and `supabase status --output json` cannot inspect local containers. The repository, CLI temporary link, and local `.env.local` Supabase URLs all identify `tbgyyyffbxveukbihnhp`; an independently confirmed dashboard reference, verified database URL, and isolated staging target were unavailable. No remote Supabase command was run and no project identity was inferred from credentials. Production remains untouched.

The following rerun completed successfully after the final migration/search-path review:

- `npm audit --omit=dev`: 0 vulnerabilities.
- `npm test`: 6 tests passed.
- `npm run test:db`: all migrations replayed and security assertions passed.
- `npm run typecheck`: route type generation and TypeScript passed.
- `npm run lint -- --max-warnings=0`: passed.
- `npm run build:test`: production build passed.
- `npm run test:browser`: 6 tests passed when run alone after the build. A concurrent build/browser attempt was discarded because both processes shared `.next`.
- Mobile `npm audit --omit=dev`: 21 affected entries (9 high, 12 moderate, 0 critical); no safe SDK-54-compatible remediation was identified. Existing Expo checks remain passing.

## Docker checklist rerun — September 17, 2026

The Docker validation checklist was executed again. No Docker-compatible runtime
was present: `docker`, Podman, nerdctl, Colima, Lima, OrbStack, and Rancher
Desktop were all unavailable. Exact results were:

| Command | Result |
|---|---|
| `supabase start -x studio,logflare,vector,edge-runtime` | Failed with `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`; exit 1. |
| `supabase db reset --local --no-seed` | Failed with the same Docker daemon error; exit 1. |
| `npm run test:db` | Passed: all migrations replayed in isolated PostgreSQL and database security assertions passed; exit 0. |
| `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f tests/database/security.sql` | Failed with connection refused because the Supabase database container was not running; exit 2. |
| `npx playwright install --with-deps chromium` | Passed; exit 0. |
| `node scripts/test-local-stack.mjs` | Failed closed with `Start the isolated local Supabase stack first.`; exit 1. |
| `docker compose -f worker/compose.yaml build` | Could not execute: `docker: command not found`; exit 127. |

Consequently, the HTTP role matrix, Supabase Auth, Storage, RLS, live function
permission behavior, partner event tests, private gallery and signed URL
integration, large upload flow, processing completion, browser integration,
container worker rendering, malformed-file handling, decoded-pixel limits, and
container resource/timeout/restart checks were not run. The existing isolated
renderer tests remain local evidence only. The staging gate was not entered:
the dashboard project reference and an independently verified staging project
were unavailable, and the shell had no `ASSET_TARGET_PROJECT_REF`,
`VERIFIED_DATABASE_URL`, or staging credentials. No remote Supabase command was
issued.

Docker Supabase HTTP/Auth/Storage integration, worker image/resource profiling, staging gallery transfer, and live read-only inventory remain unverified rather than passed. The offline gallery manifest contains 87 objects totaling 18,389,169 bytes; both staging transfer commands fail closed before network access because the required explicit staging target was absent from the command environment. The local workflow file is untracked on this branch and is not on GitHub's default branch: `gh workflow view .github/workflows/security.yml` and `gh run list --workflow security.yml` both returned HTTP 404. No CI run is therefore claimed.

## Checklist and status

| Priority | Status | Verification / remaining work |
|---|---|---|
| 1. Next.js and Sharp | **Completed** | Next/eslint-config-next 16.3.5, Sharp 0.35.4; npm lockfile; web production audit clean; production build, optimizer and renderer tests pass. Separate mobile residual advisories documented. |
| 2. Function permissions | **Complete locally; staging pending** | Exact-signature grants/defaults/search paths hardened; anonymous/null-UID/cross-job/payload tests and legitimate partner/admin-trigger/service behavior pass in isolated PostgreSQL. Docker-backed Supabase and live inventory remain required. |
| 3. Admin authorization | **Complete locally; staging pending** | Shared guards, fail-closed canonical ownership, mobile role/owner alignment, direct SQL RLS tests. Existing portal/partner policy branches retained. Full HTTP role suite awaits Docker-backed Supabase. |
| 4. Galleries | **Blocked at asset cutover** | Shared authorization and private asset delivery implemented; offline manifest verified/generated. Remote transfer and authenticated viewing must succeed before removing retained source assets. No production transfer authorized/performed. |
| 5. Image endpoints | **Blocked at full-stack validation** | Direct uploads, capability-authorized jobs/downloads, bounded worker, quotas/retries/cleanup, UI progress and Docker configuration implemented. Worker rendering passes locally, including >4.5 MB input. Storage-to-worker HTTP flow and container resource profile require Docker-backed staging; not deployed. |
| 6. CI/tests | **Blocked at full-stack execution** | Independent local checks and the workflow definition are present. The local Supabase HTTP/Auth/Storage/browser integration and Docker worker build cannot run without Docker; GitHub has no run for this unpushed workflow (workflow/run lookup returned 404). No skip/continue-on-error conceals this requirement. |

“Completed locally” does not mean production is verified. Production behavior is unverified throughout this report.

## Root causes and resulting behavior

**Dependencies.** Vulnerable pinned Next and Sharp releases remained in the lockfile. Verified official advisories and current npm releases; selected compatible patch versions, keeping Next/eslint-config-next aligned and the optional SWC binary aligned. Compatible transitive web updates removed six additional advisory entries. No forced fixes, overrides or major upgrade. Details and remaining mobile advisories: [dependency security](docs/DEPENDENCY_SECURITY.md).

**Database functions.** Revoking PUBLIC did not remove Supabase's explicit API-role grants. Missing `auth.uid()` was incorrectly interpreted as service authority. Exact overloads now explicitly revoke PUBLIC/anon/authenticated/service_role before necessary grants; trigger-only functions have no API execute; public QR resolution/logging is deliberately retained. Definers use empty search paths and qualified objects. The logger checks trusted JWT role, active membership, job company, event type, payload keys/types/size and identity lengths. Deleted-job events originate from a database trigger; a subsequent application log can only annotate the caller's recent matching deletion. Fabricated missing jobs are denied. Partner lifecycle status policies and notification dispatch remain in place.

`postgres` global PUBLIC defaults and public-schema API execution defaults are revoked for future functions. Additional live creators/overloads cannot be assumed absent: inspect the supplied read-only inventory before rollout. [Function inventory and caller matrix](docs/FUNCTION_PERMISSIONS.md).

**Admin boundaries.** Several actions checked only login, and owner predicates let any self-signup create a private administrative dataset. Every relevant client/invoice/payment/settings/task/saved-QR action now calls `requireAdmin`. Admin-only asset APIs share `requireAdminApi`. The secret-authenticated clients integration keeps machine authorization and now writes the canonical owner. Invoice/portal/partner routes retain intentional role-scoped access.

`current_owner_id()` now returns the unchanged canonical owner only to database-listed admins and NULL otherwise. Existing USING and WITH CHECK predicates, including related portal administration/storage predicates, consequently fail closed without broad policy rewrites or recursion. Invoice numbering is separately admin/service guarded; raw API sequence use is revoked. `admin:sync` and canonical ownership are preserved. The unused legacy `cutline-files` per-user storage policy is removed after confirming no web/mobile/script caller; bucket contents remain untouched. Mobile no longer classifies all non-portal users as admins, and its invoice/upload writes resolve the canonical owner rather than the current admin's UID.

**Galleries.** Six copied gates contained fixed credentials and forgeable or inconsistently signed cookies. `/gso` bypassed the designs gate. Marty lead data was statically imported into a public client bundle. Gates now share server-only validated config, gallery-scoped HMAC sessions, constant-time comparison, expiry and durable atomic quotas; missing config/backend fails closed. `/gso` redirects to `/designs`. Private asset routes authorize before signing 60-second URLs and return private/no-store responses. Remote Next optimizer origins are disabled to prevent signed-asset recaching. Marty data is fetched server-side after authorization and passed as props only then.

The infrastructure migration privatizes existing gated buckets and restricts direct object API policies. Newpremades/Marty use a private `restricted-galleries` bucket. The transfer tool plans 87 objects with SHA-256, resumes verified objects, refuses overwrites and verifies uploads by downloading them. Sources remain deliberately retained until transfer AND application checks succeed. This means current-repository exposure of retained sources is still unresolved; removing them later cannot erase history or previous copies.

**Image tools.** Multipart input and binary output exceeded Vercel's 4.5 MB Function limit. Browser rendering was evaluated: the existing Sharp SVG composition, color conversion and vector PDF contour make preserving output fidelity substantially simpler with the existing Node renderer. The UI now sends a small manifest, uploads directly to private storage, commits an idempotent job, polls with a random capability and downloads from signed storage. No request accepts arbitrary source URLs or another caller's storage paths.

The worker claims jobs atomically, validates actual bytes/decoded metadata and runs the existing renderers in a credential-free child with a kill deadline, bounded concurrency, input/output/pixel budgets and container CPU/memory limits. It retries twice, recovers stale claims and cleans expired uploads/outputs/counters. Ticket retries reuse the request identity; commit and worker completion are conditional. Supported file sizes, DPI choices, print geometry, cutline vector overlay, transparency and sRGB handling remain; newly enforced decode/intermediate/output limits are explicit. See [operating limits and setup](docs/SECURITY_ROLLOUT.md).

**CI.** Added npm-ci installation, route generation before TypeScript, zero-warning lint, renderer/token tests, migration replay/RLS assertions, production audit/build, browser smoke, Docker worker build, full local Supabase integration and mobile lint/type/Expo checks. Fixed `/reset-password` crashing clean-checkout prerender when Supabase configuration is missing. Safe build/browser wrappers mask local environment credentials; tests use synthetic fixtures, localhost-only targets and disabled email.

## Changed files and migrations

- `package.json`, root lockfile, `next.config.ts`; mobile package/lockfile Expo patch compatibility updates.
- `app/actions/{clients,invoices,settings,tasks,qr}.ts`, `lib/auth.ts`; admin/portal asset redirects and clients API; mobile auth provider, invoice and upload libraries.
- All six `app/*/access.ts` gates; `/gso`; Marty server/table components; newpremades image route; `app/api/gallery/[gallery]`; `lib/security/*`, gallery data/signing helpers.
- `app/api/{cutline,mockup-sheet,bag-mockup-grid}/generate`, `app/api/processing/[id]`, `lib/processing/*`, three tool UIs, renderer bounds, `worker/*`, `.dockerignore`.
- `app/reset-password/reset-password-form.tsx`, email test guard; `.github/workflows/security.yml`, Playwright configs, `tests/*`, safe/local-stack/asset scripts, local Supabase config, `.gitignore`, `.env.example`, README and `docs/*`.
- **New only:** `supabase/migrations/20260916222337_security_permissions.sql` and `20260916222507_security_infrastructure.sql`. No previously applied migration was edited.

## Commands executed and actual results

| Command/check | Actual result |
|---|---|
| `git status`, `git rev-parse HEAD`, branch creation and project/docs inspection | Dedicated branch created; pre-existing changes retained. |
| `npm view next version`, `npm view sharp version`, `npm view eslint-config-next version` | 16.3.5 / 0.35.4 / 16.3.5 when selected. |
| `npm install --save-exact next@16.3.5 eslint-config-next@16.3.5 sharp@0.35.4 @next/swc-darwin-arm64@16.3.5`; targeted transitive updates | Completed; package manager updated lockfile. |
| `npm ci` | Passed from lockfile. npm reports install-script approval notices for existing/dev transitive packages; no check failures. |
| `npm audit --omit=dev` (root) | Passed, zero vulnerabilities. |
| `npm run lint -- --max-warnings=0` | Passed. |
| `npm run typecheck` | Passed: `next typegen` then `tsc --noEmit`. |
| `npm test` | Six tests passed: sessions/manifests, cutline PDF, >4.5 MB valid image processing/transparent sheet, grid/malformed/40+ MP rejection, invoice PDF. |
| `npm run test:db` | All repository migrations replayed and SQL assertions passed in fresh in-memory PGlite PostgreSQL. Synthetic roles test anonymous/customer/portal/partner/admin/service, canonical ownership, invoice triggers, direct writes, deletion events, quotas and global job concurrency/stale recovery. |
| `npx tsx tests/database/run.mts --inventory` | Generated repository-based function/grant inventory. No live DB used. |
| `npm run build:test` | First run exposed missing-config password-reset crash; fixed. Subsequent production builds passed. |
| `npx playwright install chromium`; `npm run test:browser` | Six browser tests passed: public/intake pages, route redirects/download denial, all gallery gates/forged cookies, tool pages/disabled worker, password reset, local public image optimization. |
| `npm run assets:plan` | Manifest for 87 source objects generated offline. Upload/verify remote modes not run. |
| Mobile `npm ci`, Expo-compatible patch install/update, `npm run typecheck`, `npm run lint`, `npx expo install --check`, `npx expo-doctor` | Passed after four patch mismatches fixed; Doctor 18/18. |
| Mobile `npm audit --omit=dev --json` | Fails audit: 21 affected entries, 9 high/12 moderate, no critical. Exact entries/applicability/remediation documented; no forced SDK migration. |
| `supabase start -x studio,logflare,vector,edge-runtime` | Failed: cannot connect to Docker daemon `/var/run/docker.sock`; no local stack started. |
| `supabase db reset --local --no-seed` | Failed: same Docker daemon blocker; no local reset occurred. |
| `npm run test:db` | Passed again when run as part of the requested gate: all migrations replayed and security assertions passed in isolated PostgreSQL. This does not cover Supabase HTTP/Auth/Storage. |
| `psql ... -f tests/database/security.sql` | Failed: `127.0.0.1:54322` refused the connection because the local Supabase database was not running. |
| `npx playwright install --with-deps chromium` | Passed. |
| `node scripts/test-local-stack.mjs` | Failed closed with `Start the isolated local Supabase stack first.` because the Docker-backed stack was unavailable. HTTP role/admin UI/private upload/gallery/worker integration tests remain unexecuted. |
| `docker compose -f worker/compose.yaml build` | Not executable: `docker: command not found`. |
| `docker compose -f worker/compose.yaml up --build -d` | Not executable: `docker: command not found`. |
| `npx tsx scripts/gallery-assets.mts upload` | Failed closed: `Explicit target project identity must match SUPABASE_URL`; no remote request. |
| `npx tsx scripts/gallery-assets.mts verify` | Failed closed with the same identity error; no remote request. |
| `gh workflow view .github/workflows/security.yml`; `gh run list --workflow security.yml` | Both returned HTTP 404 because the workflow is only in the unpushed worktree. No CI result claimed. |
| `git diff --check` | Passed. Final review includes new files, dependency versions, private asset client imports and secret patterns. |

Local Node was v26.3.1; the six renderer/token tests also passed under Node 22 via `npm exec --yes --package=node@22 -- node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts`. CI/worker clean Linux execution remains an explicit verification gate.

## Required configuration, rollout and recovery

The [rollout runbook](docs/SECURITY_ROLLOUT.md) supplies exact environment variables, independent Supabase project verification, ordered migration/copy/application/worker cutover, private bucket limits, CORS checks, source retention, production smoke tests and forward-fix/rollback instructions. No external worker credentials were invented and no worker is claimed deployed.

Recommended required checks are `web`, `database` and `mobile` under **Security and reliability**. Branch-protection settings were not changed. Full-stack tests use the Supabase CLI local stack only and never accept a remote target.

## Remaining risks and exact blockers

1. **No running Docker daemon.** Full Supabase Auth/PostgREST/Storage HTTP integration, worker image build and container-limit profiling were not executable locally. Use [the Docker validation guide](docs/DOCKER_VALIDATION.md) on an isolated Docker-capable host or CI runner, then run the implemented database job and `node scripts/test-local-stack.mjs`. Do not mark these checks verified based on PGlite or mocked Auth/Storage scaffolding.
2. **Asset copy/cutover has not occurred.** Current tracked source assets remain until checksum transfer and authenticated application verification. Review the manifest and complete the runbook before removing them. Historical public exposure is irreversible by current-tree removal.
3. **Worker host not provisioned/deployed.** Docker integration/configuration is supplied; review capacity, secrets, outbound access, Storage CORS, queue/cleanup monitoring and high-DPI production artwork tests. Generation intentionally fails closed while `PROCESSING_ENABLED` is absent/false.
4. **Mobile advisory debt.** SDK-54-compatible updates do not resolve all transitive advisories; SDK upgrade/backports and native/device testing remain. No clean mobile security audit is claimed.
5. **Live schema/config drift is unknown.** Repository project identity is documented, but no remote inventory was performed. Unknown function creators/overloads, historical grants, bucket policies and cached public assets require the read-only preflight and staging checks.
6. **Shared four-digit access remains a shared credential model.** HMAC sessions and durable quotas prevent cookie forging and bound guessing; users can share codes/downloads. Sensitive per-person revocation would require account-based galleries outside this focused change.
7. **Native workload limits are finite, not a performance guarantee.** Local renderer tests establish representative fidelity, not every 600-DPI/40-image workload on a 2 GB host. Output/decoded/intermediate limits and timeouts are explicit; high-load production suitability remains a staging gate.

## Docker-capable host and CI handoff

The exact setup and run sequence is in [docs/DOCKER_VALIDATION.md](docs/DOCKER_VALIDATION.md). It covers Docker Desktop/daemon prerequisites, local Supabase replay, HTTP/Auth/Storage and browser integration, worker Compose limits, explicit staging identity verification, gallery checksum transfer, and the staging workload matrix. A Docker-capable runner must execute the workflow after this branch is pushed; the workflow currently defines `web`, `database`, and `mobile` jobs, but no remote execution has occurred for this worktree.

## Next production rollout steps

1. Push the reviewed branch and require successful `web`, `database`, and `mobile` GitHub checks, including the Docker-backed local Supabase integration and worker image checks.
2. On a Docker-capable staging host, complete the identity preflight and run `psql "$VERIFIED_DATABASE_URL" -f docs/security-inventory.sql`; reconcile every difference with `docs/FUNCTION_PERMISSIONS.md`.
3. Apply the two security migrations to staging only, reconcile workspace admins, and verify all role, function, RLS, Storage, gallery, and processing checks.
4. Upload and checksum-verify the 87 gallery objects in the private staging bucket, then complete authenticated gallery smoke tests and retain the repository sources.
5. Run the bounded worker with `PROCESSING_ENABLED=false` through the complete realistic workload and recovery matrix; review resource and queue metrics.
6. After staging passes, schedule the reviewed production cutover: backup, apply the two migrations in order, configure secrets/private buckets, deploy the compatible application and worker, run production smoke checks, and enable `PROCESSING_ENABLED=true` only after worker health and signed-download checks pass.

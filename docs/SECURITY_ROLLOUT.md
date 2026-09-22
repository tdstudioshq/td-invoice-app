# Security rollout runbook

This branch is not deployed. Do not run production steps until the full local/isolated-stack suite and staging smoke tests pass. No production data has been accessed by this implementation session.

## Configuration and identity

The repository at the audited HEAD identifies `tbgyyyffbxveukbihnhp.supabase.co` in `next.config.ts`. Compare the configured `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, CLI linked project and dashboard project reference before any remote access. `supabase/config.toml` is a local test project, not a production link. Never pass remote URLs to reset/test scripts.

Preserve `ADMIN_EMAILS`, the existing `workspace_owner` row, and `admin:sync`. Reconcile admin memberships before tightening permissions. Do not use `--adopt` or `--prune` unless separately reviewed; neither was run here.

Required server variables:

- Existing `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `GALLERY_SESSION_SECRET`: independent random secret of at least 32 characters; do not reuse a Supabase credential. Rotation logs everyone out.
- `GALLERY_CODE_DESIGNS`, `GALLERY_CODE_TASTE_BUDZ`, `GALLERY_CODE_MAFIATERPZ`, `GALLERY_CODE_MARTYIG`, `GALLERY_CODE_PREMADEDESIGNS`, `GALLERY_CODE_NEWPREMADES`: independently chosen four-digit codes, matching the existing keypad UI. Missing/invalid values lock the corresponding gallery. Old hardcoded codes and cookies are no longer accepted.
- `PROCESSING_ENABLED=true` only after a healthy worker and transfer smoke test. Without it, generation returns a clear 503.
- Worker: only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Keep the service key in the host's secret store.
- `DISABLE_EXTERNAL_EFFECTS=true` in tests/staging. The isolated scripts also clear email credentials. Never exercise the legacy external Formspree submission with real destinations during smoke tests.

## Ordered staging and production cutover

1. Review the two new migrations. Replay all migrations against isolated Supabase with Docker, run `npm run test:db`, then `node scripts/test-local-stack.mjs`. These scripts do not accept a production database URL. CI's `database` job performs both layers. Embedded tests replace only Supabase-managed Auth/Storage scaffolding and pgcrypto extension creation, so they do not substitute for this step.
2. After project identity verification, run the read-only `docs/security-inventory.sql`. Compare live function owners, overloads, default ACLs, policies, triggers and bucket settings against the repository inventory. Only `postgres` creates functions in the repository migration replay. If another live creator grants API defaults, add a reviewed role-specific default-privilege revoke before rollout. Do not blanket-revoke unknown overloads.
3. Reconcile `ADMIN_EMAILS` and `workspace_admins` with existing `admin:sync`. Confirm all admins resolve to the unchanged canonical owner. Review older mobile builds: secondary admins need the canonical-owner client update shipped in this branch.
4. Stage gallery objects **before application cutover**. Create a private `restricted-galleries` bucket (50 MB object limit), then use the asset process below. Existing `GSO`, `TASTE BUDZ`, `MAFIA terpz`, `premade-designs` objects stay in place; the infrastructure migration makes their buckets private and adds restrictive API policies. Retain all source objects.
5. Schedule a brief coordinated cutover: apply `20260916222337_security_permissions.sql`, then `20260916222507_security_infrastructure.sql` after backup/review; configure gallery variables and deploy the application together. These migrations have not been applied to production by this session. Old gallery clients using public URLs will stop loading when the buckets become private; do not leave an old application deployed between steps.
6. Build and run the worker on a Docker host: `docker compose -f worker/compose.yaml up --build -d`. It needs 2 CPUs, 2 GB RAM, HTTPS egress to Supabase and private /tmp space. No inbound port is needed. This worker is **not** a Vercel Function and is not deployed. Start one replica; claims enforce a global maximum of two jobs across replicas. The container has a read-only filesystem and bounded temporary storage; the native decoder runs without service credentials in a killable child.
7. Verify direct upload CORS for the actual application origin, 30 MB `processing-inputs` objects, 120 MB `processing` outputs, and private access on both buckets. Enable `PROCESSING_ENABLED` only after end-to-end validation. Old multipart API clients must upgrade with the UI; the routes now accept small JSON upload manifests.
8. Run the smoke checks below; only then consider source removal from the current Git tree. Purge any previously public CDN/optimizer entries for restricted galleries. No Git history rewrite or production asset deletion is authorized here.

## Resumable asset transfer

`npm run assets:plan` creates `docs/gallery-assets-manifest.json`: 86 newpremades WebP variants plus the Marty lead JSON, including byte size and SHA-256. It runs offline and has been executed.

For an isolated/staging project, set the existing Supabase server variables and `ASSET_TARGET_PROJECT_REF` to the independently verified project reference. Run:

```sh
npx tsx scripts/gallery-assets.mts upload
npx tsx scripts/gallery-assets.mts verify
```

Each object is downloaded and checksum-verified before being skipped. Upload uses `upsert: false`; differing existing bytes stop the process. Every newly uploaded object is read back and verified. Restarting resumes completed objects. The tool never deletes a source or remote object. Production copy additionally requires `ALLOW_PRODUCTION_ASSET_COPY=true` after review; that flag was never set here.

Keep `assets/newpremades/` and `app/martyig/leads.json` until transfer verification **and authenticated application viewing** succeed. They are no longer runtime asset sources or client imports, but remain in the repository to satisfy source-retention requirements. This is an unresolved exposure while the repository remains public. Removing them later does not undo historical public exposure, forks, browser caches or downloads.

## Limits and operations

- Galleries: scoped HMAC sessions expire after eight hours; HttpOnly, SameSite=Strict, Secure in production. Each gallery has 10 attempts/10 minutes/IP and 100 attempts/10 minutes globally, atomically counted in PostgreSQL, including successful attempts. A missing database fails closed. Vercel's overwritten IP header is used; outside Vercel all callers deliberately share one bucket until a trusted ingress implementation is reviewed.
- Gallery byte routes authorize before issuing 60-second signed redirects with `private, no-store`. Premade-design URLs expire after 60 seconds and bypass Next's optimizer. Remote optimizer origins are disabled. Signed URLs are bearer capabilities: copies remain usable until expiry; already downloaded bytes cannot be recalled.
- Tools: cutline 30 MB/image; sheet/grid 25 MB/image; 80 MB total; existing 8-slot and 40-image limits retained; single-frame PNG/JPEG (plus WebP for mockups); 40 MP decoded input; scaled artwork/output raster budget up to 120 MP; 120 MB serialized output. Existing DPI choices, print geometry, sRGB conversion, PNG alpha and vector cut-contour embedding remain. Exceeding decoded or intermediate limits yields an explicit failure instead of an unbounded allocation.
- Public processing: 30 exports/hour/IP. A global daily quota reserves the worst-case 30 MB per signed upload plus 120 MB output, capped at 10,240 MB/day. Tickets carry random capabilities; the server stores only hashes. Ticket retry IDs, conditional commit and queue claims prevent duplicate processing. Only server-issued bucket/object paths can be fetched; no arbitrary URL input exists.
- Transfers have a 60-second aggregate input deadline, API/storage calls 30 seconds, native rendering 120 seconds, and two attempts maximum. Five-minute stale leases recover crashed workers. Inspect failed jobs and queue age; generic failure messages avoid leaking customer filenames or infrastructure errors. An undersized host can still fail a high-DPI job: profile full production artwork in staging before enabling.
- Cleanup runs in the worker loop: expired jobs and their known input/output objects after 24 hours; expired quota rows after one day. Keep at least one worker alive even when intake is disabled. Alert on worker exits, queue age > five minutes, repeated failures, cleanup failures, bucket size and billing. Worker downtime delays deletion. Host/container replacement cleans tmpfs; per-job directories are removed on normal success/failure.

## Post-deployment smoke checks

Use synthetic accounts and files. Confirm homepage/intake navigation, password reset, customer onboarding redirect, portal access and Zaza host routing. Verify two admins see the same client/invoice dataset and invoice creation, item totals, payment and PDF still work. Confirm direct customer REST inserts into administrative tables fail; portal reads only its client/non-draft invoices; partner cross-company reads/events fail; legitimate status and deletion events remain visible.

Check all six gallery gates, `/gso` redirect, forged/expired/wrong-gallery cookies, throttle exhaustion, raw public bucket URL denial, thumbnails/previews/downloads and optimizer rejection. Unlock each gallery and verify all migrated assets.

Upload a valid file above 4.5 MB to each tool, verify progress and output, print sizes/alpha/CutContour, token denial, idempotent commit, malformed/40+ MP rejection, output above 4.5 MB, interrupted worker recovery, retries, quotas and cleanup. Check mobile primary/secondary admin invoices and portal file upload.

## Rollback and forward fixes

Prefer forward fixes. Disable new processing intake with `PROCESSING_ENABLED=false`; keep the worker running for cleanup. Restore worker version if needed; jobs can retry within two attempts. Rotate gallery secret to revoke sessions. Restore app code only to a version compatible with private storage and the new ownership contract. Do not restore forgeable cookies, public buckets, anonymous event grants or non-admin ownership fallback. Restore objects from retained sources using checksum verification if transfer failed. For SQL regressions, write a new corrective migration after an isolated reproduction; never edit applied migrations or restore broad grants as a shortcut.

Recommended required branch checks: `web`, `database`, `mobile` from `Security and reliability`. No repository settings have been changed. The database job must pass before rollout; it has not run locally due to the missing Docker daemon.

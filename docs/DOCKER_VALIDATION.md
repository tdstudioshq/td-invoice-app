# Docker-capable validation guide

Run this guide on a machine with Docker Desktop or another daemon available at
`/var/run/docker.sock`, or in a Linux CI runner with Docker. Use an isolated
local Supabase stack for local integration. These commands do not accept a
remote database URL.

## Local Supabase and worker checks

From the repository root, install Node 22 and dependencies, then run:

```sh
supabase start -x studio,logflare,vector,edge-runtime
supabase db reset --local --no-seed
npm run test:db
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f tests/database/security.sql
npx playwright install --with-deps chromium
node scripts/test-local-stack.mjs
docker compose -f worker/compose.yaml build
```

The local integration wrapper starts the application with synthetic accounts
and local-only Supabase credentials. It covers the HTTP role matrix, function
authorization, partner events, private gallery and portal Storage, signed
URLs, large direct uploads, processing completion, and browser flows. The
worker renderer tests cover cutline PDF output, transparent sheets, grids,
malformed files, decoded-pixel limits, and inputs over 4.5 MB.

Run the bounded worker against an explicitly configured staging project only
after the staging migrations, buckets, and identity checks are complete:

```sh
PROCESSING_ENABLED=false docker compose -f worker/compose.yaml up --build -d
docker compose -f worker/compose.yaml ps
docker compose -f worker/compose.yaml logs --tail=200 image-worker
```

The compose service requires `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the
host environment. It applies two CPU, 2 GB memory, 128 process, read-only
filesystem, and 512 MB `/tmp` limits. Keep intake disabled until the complete
staging workload has passed.

## Staging identity and gallery checks

Before any remote command, independently compare all four values:

1. `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`.
2. The Supabase CLI linked project reference.
3. The dashboard project reference.
4. The repository's documented project reference.

Stop if any value differs or if the dashboard reference cannot be confirmed.
For an isolated staging project, set its verified URL and reference explicitly:

```sh
export SUPABASE_URL='https://<verified-staging-ref>.supabase.co'
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export ASSET_TARGET_PROJECT_REF='<verified-staging-ref>'
export SUPABASE_SECRET_KEY='<staging-server-secret>'
```

Run only the read-only inventory first:

```sh
psql "$VERIFIED_DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/security-inventory.sql
npm run assets:plan
npx tsx scripts/gallery-assets.mts upload
npx tsx scripts/gallery-assets.mts verify
```

Compare the inventory with `docs/FUNCTION_PERMISSIONS.md`. Confirm private
buckets, checksum matches, authenticated gallery viewing, `/gso` redirect,
forged/expired/wrong-gallery rejection, direct public object denial, optimizer
and preview authorization, and throttling before any source retention decision.

## Staging worker workload

Use synthetic and representative files to exercise 30 MB cutline inputs,
25 MB sheet/grid inputs, 80 MB combined input, outputs over 4.5 MB, retries,
idempotent commits, stale recovery, quotas, cleanup, restarts, and clear
malformed/pixel/timeout/output-limit failures. Confirm dimensions, DPI,
transparency, sRGB conversion, and cutline PDF output. Capture worker logs,
queue age, failed jobs, resource use, and signed-download behavior.

Keep `PROCESSING_ENABLED=false` until these checks and the gallery application
smoke tests pass. Do not apply production migrations, delete retained assets,
deploy the worker or application, or enable processing as part of this guide.

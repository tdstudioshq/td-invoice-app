# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version

This project uses **Next.js 16.3.1** with **React 19**. The pinned guidance in `AGENTS.md` is not optional: APIs and conventions differ from older Next.js. Before writing or changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` (`01-app`, `02-pages`, `03-architecture`).

## Where to look

**This file holds only what is true repo-wide.** Feature deep-dives live in `.claude/docs/` and are loaded on demand — the invariants in them are load-bearing (most record a decision that was made the other way first), so read the relevant file *before* touching that area rather than inferring from the code.

| Doing this | Read first |
| --- | --- |
| Writing a migration, or reasoning about RLS | `.claude/docs/database-schema.md` |
| Anything in the print-partner portals, or an invoice linked to a partner job | `.claude/docs/print-partner-portals.md` |
| Adding or changing a public form that persists | `.claude/docs/custom-mylar-printing.md` (covers both: the mylar wizard and `/custom-design-request`) |
| Portal files, projects, uploads, or "view as client" | `.claude/docs/client-portals.md` |
| Adding a public gallery page, or the keypad gate | `.claude/docs/portfolio-gallery.md` |
| A mockup tool, or a cutline preset | `.claude/docs/mockup-tools.md` |
| Touching any owner-scoped RLS policy, or writing `owner_id` | **Workspace admin ownership** (this file) |
| A new route that reads Supabase | **Routes & rendering** + **Data flow** (this file) |
| Verifying a change by hand | **Verifying changes** (this file) |
| Deleting a file, or acting on `npx knip` output | `CODEBASE_CLEANUP_AUDIT.md` (root) — the knip calibration in §0, and the risk rubric |
| Shipping anything to production | **Deployment workflow** (this file) |
| Throwing, catching, or logging an error | **Error handling & reporting** (this file) |
| A static site in `public/`, or a remote image | the `next.config.ts` bullet in **Conventions** |
| Adding **any** image, or reaching for `next/image` | the image-optimizer bullet in **Conventions** (it returns 402 → blank) |
| Choosing an icon library for a file | the icon bullet in **Conventions** |
| Expo / mobile work | `.claude/docs/mobile-app.md` |
| The home card (`/`), its slideshow or backdrop | `.claude/docs/home-card.md` |
| QR codes, `/q/<slug>`, or scan analytics | `.claude/docs/qr-platform.md` |

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # bare eslint over the project (flat config: eslint.config.mjs)
npm run typecheck # tsc --noEmit
npm run test     # bun test (the premade-sync unit tests are the only suite)
bun test scripts/premade-sync/core.test.ts   # one file
bun test -t "content-hash deduplication"     # one describe/test by name
npm run smoke:routes # route assertions over the public surface — NEEDS a running server (see Verifying changes)
npx knip         # unreferenced files/exports/deps (config: knip.json; NOT in the gate — read the calibration note first)

bun run premade:sync:dry      # reconcile the master folder / Storage / manifest, no writes
bun run premade:sync          # upload only new SHA-256 designs (see Premade catalog ingestion)
bun run premade:sync:verify   # dry run that re-hashes every Storage object, no cache

npm run client:create-marty  # idempotent portal-client bootstrap; runs scripts/create-marty-client.ts with node --env-file=.env.local (see Provisioning script in .claude/docs/client-portals.md)
npm run admin:sync           # reconcile workspace_admins/workspace_owner with ADMIN_EMAILS (read-only audit by default)
npm run admin:sync -- --adopt --prune  # ...and re-own stranded rows / drop admins no longer in ADMIN_EMAILS (see Workspace admin ownership)

# Migrations — the Supabase CLI is linked (supabase/.temp/linked-project.json).
supabase migration new <name>     # new timestamped file (the current naming scheme)
supabase migration list --linked  # local files vs. remote history
supabase db push --linked         # apply ONLY the pending ones
```

**Two runtimes, and both are required.** `npm run test` shells out to **`bun test`**, and all three `premade:sync*` scripts run `bun run --env-file=.env.local` — so **Bun must be installed** or the gate dies at step 4 for reasons that have nothing to do with the change. `client:create-marty` and `admin:sync` are the opposite: plain Node with `--env-file=.env.local` (so Node ≥ 20.6), no Bun. Everything else is npm/Next.

**`npx knip` is not part of the gate and its raw output must not be trusted.** There is no npm script on purpose. `knip.json` carries `entry` overrides (`proxy.ts`, `next.config.ts`, `app/**/access.ts`, `scripts/*.ts`) because without them knip cannot see how this repo is entered, and it is **wrong in both directions** even with them — `CODEBASE_CLEANUP_AUDIT.md` §0 records the calibration and which claims were false. Read that before acting on a single line of its output; a file knip calls unused may be a docs contract, ops tooling or an externally-shared URL.

`next lint` was **removed in Next 16** — use `npm run lint`. There is no `lint:fix` script; run `eslint --fix` directly. `npm run typecheck` is a thin alias for `tsc --noEmit`, and `npm run test` runs `bun test` — the premade-sync pure helpers in `scripts/premade-sync/core.test.ts` are the only tests in the repo, so a green `test` still proves nothing about a route, an action or an RLS policy.

## Verifying changes

```bash
npm run lint && npm run build && npx tsc --noEmit && npm run test && npm run smoke:routes
```

**`npm run build` must come BEFORE `npx tsc --noEmit`.** Next 16 generates the
global `PageProps` / `RouteContext` types into `.next/types` during the build, so
on a clean tree (or after `rm -rf .next`) a typecheck run first fails with
`Cannot find name 'PageProps'` in files that are perfectly fine. The old
lint→tsc→build order only worked because `.next` happened to be warm.

**`npm run smoke:routes` needs a server** (`npm run dev` in another shell, or
`BASE=<preview-url>`): route-level assertions over the public surface,
including the `Location` header on each redirect. Nothing else in the gate ever
issues a request, so a deleted route or a dropped `PUBLIC_PATHS` entry builds
perfectly green.

**Run all of them before calling work done — and then verify the feature by hand.** There is no jest/vitest/playwright here; the only test files are the pure premade-sync helpers exercised by `bun test` (`scripts/premade-sync/core.test.ts`), so those three commands are still very nearly the *entire* automated gate, and what they prove is narrow: lint catches style and a few React/Next foot-guns, `tsc` catches type errors, and `npm run build` catches bad imports, server/client boundary violations and prerender failures. **None of them execute a Server Action, evaluate an RLS policy, or render a page with real data — so a green build is not evidence that the feature works.** Anything behavioral has to be exercised in a browser.

### Hosts

| URL | Serves |
| --- | --- |
| `localhost:3000` | everything except the partner portals |
| `zazaorders.localhost:3000` | the Zaza partner portal on its real subdomain |
| `tnt.localhost:3000` | the TNT partner portal (jobs **and** invoices) |

The partner portals resolve by **hostname**, so a change to `resolvePartnerRoute()` / `proxy.ts` / `partnerBasePath()` must be checked on the subdomain *and* on the two other addresses that reach the same pages (`/zaza-orders/jobs` and `/partner/zaza/jobs`) — a link built the wrong way is correct on one and broken on the others. `*.localhost` resolves to 127.0.0.1 on macOS with no `/etc/hosts` entry; matching is on the leftmost label, so the same `PARTNER_SUBDOMAINS` entry covers dev and production.

### Roles

Authorization is Postgres RLS plus `requireUser()` / `requireAdmin()` / `requirePortalUser()` / `requireCustomer()`, none of which the build exercises. Verify anything role-sensitive as **each** role it touches, in its own browser profile or a private window (sessions are cookie-based, so one browser holds one role at a time):

| Role | Reaches | Established by |
| --- | --- | --- |
| Owner / admin | `/dashboard` and the rest of `(app)` | email in `ADMIN_EMAILS` |
| Portal user | `/portal/*`, one client only | an active `client_users` row |
| Customer | `/account/pending` only | self-signup, no `client_users` row yet |
| Print partner | one company's portal | the keypad, which signs in a shared Supabase account |

**Credentials and keypad codes are deliberately not written down here.** Local values belong in `.env.local` (gitignored); the keypad codes are constants in each route's `access.ts`.

### Manual QA checklist

Not every row applies to every change — work the ones that do:

- **Happy path** — the change does what it was asked to do, with realistic data.
- **Validation failures** — submit the form empty, over every length cap, and with the wrong file type. Errors are server-side zod, so check the message actually reaches the UI.
- **Runtime error states** — the boundary renders instead of a blank screen (see **Error handling & reporting** for how to trigger one).
- **Unauthorized access** — signed out, hit the URL directly: expect a redirect to `/login`, not a flash of content.
- **Role-based authorization** — signed in as the *wrong* role, hit the URL directly. Cross-tenant ids should read as "not found", never "forbidden" (an existence oracle).
- **Direct URL navigation** — deep-link to the page rather than clicking into it; server components and guards run in a different order than they do on a client transition.
- **Browser refresh** — reload mid-flow. Wizard drafts mirror into `sessionStorage`; tabs/filters that live in the URL must survive, and cookie-backed view preferences must render correctly on the *first* paint.
- **Loading states** — throttle the network and confirm the `loading.tsx` skeleton appears rather than a frozen page.
- **Empty states** — a client with no invoices, a gallery whose bucket is missing, a partner with no jobs. Reads degrade to `[]` by design, so empty is a *supported* state, not an error.
- **Mobile / responsive** — check at 390px. Public pages use the `.public-page` safe-area shell; admin tables switch to card lists below `sm`.
- **Hostname routing** — see the Hosts table above.
- **Supabase / RLS** — when a policy or an `owner_id` write changed, verify **as each affected user with their own session**. The service role bypasses RLS and proves nothing.

### Without Supabase configured

Every read and write is guarded by `isSupabaseConfigured()` / `isSupabaseAdminConfigured()` / `isResendConfigured()`, so the app builds and renders empty states with no `.env.local` at all. That is a supported mode — check new data code still degrades instead of throwing.

## Deployment workflow

**Production (`tdstudiosny.com`) deploys from `main`, and only from `main`.** A feature branch that is committed, pushed, and green is still not live — Vercel never builds it. This section exists because that assumption shipped nothing for four days: five phone-facing commits sat on `mobile-optimization-pass` while `main` deployed unrelated work, so the site looked stale with no error anywhere to explain why.

- **Never treat committed or pushed as live.** `git push origin <branch>` reaches GitHub, not production. The only evidence that something is live is the production URL serving it.
- **Check the current branch before making changes** — `git branch --show-current`. It decides whether the work needs a merge to ship at all.
- **When the task explicitly includes deployment**, the sequence from a feature branch is:
  1. Run the whole gate from **Verifying changes** *before* anything is pushed.
  2. Commit and push the feature branch.
  3. Merge into `main`.
  4. Push `main`.
  5. Confirm the production deployment reached **Ready** (`vercel ls --prod`).
- **Verify the change against the production URL, not the build log.** A green deploy only proves the bundle compiled — it does not prove the page changed. Fetch the page and grep for a marker unique to the new code (`curl -sL https://tdstudiosny.com | grep -c '<marker>'`); the apex 308-redirects to `www`, so `-L` is required. If the marker is absent while `x-vercel-cache: MISS` and `age: 0`, the origin genuinely lacks the code — a stale CDN is almost never the real cause.
- **Report all six facts when the work is done:** branch used, commit SHA, whether it was merged to `main`, whether `main` was pushed, production deployment status, and what production verification was performed.
- **Never leave deployment-requested work sitting on a feature branch without warning, in plain words, that it is NOT live.** Silence reads as shipped.


## Environment variables

`.env.example` is the template. Every read/write is guarded by `isSupabaseConfigured()` / `isSupabaseAdminConfigured()` / `isResendConfigured()`, so **all of these are optional** — missing vars degrade gracefully (empty states, disabled email) rather than crashing. The individual Architecture sections below explain where each is used; this is the consolidated index.

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | SSR client (`lib/supabase/server.ts`, `client.ts`) | RLS-scoped, browser-safe. |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` / `SUPABASE_JWKS_URL` | Route-handler client (`lib/supabase/with-supabase.ts`) | Server-only; `SECRET_KEY` bypasses RLS. |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | Service-role admin client (`lib/supabase/admin.ts`) | **Bypasses RLS** — narrow uses only (see Three Supabase clients). |
| `ADMIN_EMAILS` | `isAdminEmail()` in `lib/auth.ts` | Server-only allowlist. **Must be set or no one can reach the admin dashboard.** |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | `lib/email/client.ts` | Server-only; invoice + portal-invite email. |
| `NEXT_PUBLIC_SITE_URL` | `app/layout.tsx` (metadata base), `lib/email/client.ts` (link generation) | Set in production; both call sites fall back to `https://$VERCEL_URL`, then `http://localhost:3000`. |
| `MARTY_TEMP_PASSWORD` | `scripts/create-marty-client.ts` only | **Not in `.env.example`** — pass it inline for the one-off run (see **Provisioning script** in `.claude/docs/client-portals.md`); only needed when a password will actually be set. |
| `QR_SCAN_SALT` | `app/q/[slug]/page.tsx`, `lib/mylar-printing/abuse.ts` | Optional (defaults to a built-in salt); salts the hashed IP behind QR scan logging **and** the mylar-printing submission rate limit. |
| `ZAZA_PORTAL_EMAIL` / `ZAZA_PORTAL_PASSWORD`, `TNT_PORTAL_EMAIL` / `TNT_PORTAL_PASSWORD` | `app/(partner)/partner/[slug]/access.ts` | Server-only. The shared Supabase account each partner's keypad code signs in as (one pair per company) — the gate **fails closed** without them. See `.claude/docs/print-partner-portals.md`. |
| `PREMADE_GALLERY_COOKIE_SECRET` | `app/premadedesigns/access.ts` | Optional; HMAC key for the `/premadedesigns` keypad cookie. **Falls back to `SUPABASE_SECRET_KEY`**, so the gate fails closed only when neither is set. Rotating it invalidates every existing unlock. |
| `GALLERY_ACCESS_CODE` | `lib/gallery-access.ts` | **Required.** The shared keypad code for the four gated galleries. No source fallback — unset fails closed and every gate refuses entry. |

## Conventions

App Router project. `app/layout.tsx` is the root layout. **Global font is Bebas Neue**: the layout loads Bebas Neue + Geist + Geist Mono via `next/font` and applies `font-sans`, but `app/globals.css` maps `--font-sans`, `--font-mono`, *and* `--font-heading` all to `--font-bebas` — so effectively everything renders in Bebas Neue (single 400 weight, no lowercase). Geist stays loaded only as a fallback variable.

- **Import alias:** `@/*` maps to the repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- **Styling:** Tailwind CSS **v4** — there is no `tailwind.config.*`. Configuration and theme tokens live in `app/globals.css` via CSS (`@theme`/CSS variables); PostCSS is wired in `postcss.config.mjs` with `@tailwindcss/postcss`.
- **UI components:** shadcn/ui (`components.json`), style `radix-lyra`, base color `neutral`, RSC enabled. Generated primitives live in `components/ui/`. Add components with the `shadcn` CLI rather than hand-writing primitives. Non-shadcn UI dependencies, all deliberately scoped: `GlassCard` from `@developer-hub/liquid-glass` powers the glassy card on the public home card and login panel (`app/home-card.tsx`, `app/login/login-panel.tsx`); **`react-social-icons` was removed** along with the home card's social row — don't read its absence as an invitation to add social marks back; **`react-konva`/`konva`** and **`@dnd-kit/*`** exist only for the mockup tools (`app/tools/8pc-mockup-generator/`, `app/tools/bag-mockup-grid/`) — don't reach for either elsewhere. Three more, each scoped and each easy to reach for wrongly: **`framer-motion`** is only in these files (`app/home-card.tsx`, `app/premadedesigns/gallery.tsx`, `app/portfolio/portfolio-lightbox.tsx`, `components/portal/file-browser.tsx`, `components/mylar-printing/{wizard-progress,mylar-printing-wizard}.tsx`) — note the home card is on that list *only* for below-the-fold work, since its entrance animation is deliberately hand-written CSS so the landing page doesn't wait on hydration (see `.claude/docs/home-card.md`); **`sharp`** is **server-only and native**, used by the three compose libs (`lib/{mockup-generator,cutline,bag-mockup-grid}/compose.ts`), the partner PDF previews (`lib/partner-jobs/previews.ts`, alongside **`pdfjs-dist` + `@napi-rs/canvas`**, which exist only there and are `serverExternalPackages`) plus `scripts/sync-premade-designs.ts`, and is why each `app/api/*/generate/route.ts` pins `export const runtime = "nodejs"` — never import it into anything that can reach the client; **`jszip`** does browser-side bulk download in three places (`app/tools/{mockup-generator,cutline-generator}`, `components/partner-jobs/download-all-files-button.tsx`), and the compression setting differs on purpose — the two tools `DEFLATE` at level 6 (their output is freshly generated PNG/PDF), the partner button uses `STORE` because press sources are already compressed and its job is bundling, not squeezing. The shared point is that **no file bytes are proxied through a Vercel function**, so don't replace one with a server-side zip route.
- **Icons — two libraries, split by area; match the file you're editing.** **Phosphor** (`@phosphor-icons/react`) is the choice for **new code**: every public/standalone page uses it (`portfolio`, `taste-budz`, `gso`, `designs`, `mafiaterpz`, `martyig`, `tools/*`, `qr-generator`, `custom-design-request`, `sign-up`, `home-card`, `login`), as does the newest admin work (`components/dashboard/task-manager.tsx`, `components/portal/file-browser.tsx`, `app/(app)/qr/page.tsx`, `(customer)/account`) and four hand-swapped shadcn primitives (`dialog`, `dropdown-menu`, `select`, `sheet`). **`lucide-react` is still the icon set across the older admin `(app)` pages and most of `components/portal/`** — including `components/layout/nav-config.ts`, `app-shell.tsx`, and `components/dashboard/stat-card.tsx` — plus the remaining shadcn primitives. Don't mix both in one file: when editing existing code, use whichever that file already imports.
- **Gallery keypad gates share one module, and the gate must match the bucket.**
  `lib/gallery-access.ts` exports a single `createSignedGalleryGate()` (HMAC
  cookie, rate limited, fails closed). Each route's `access.ts` is a thin
  `"use server"` wrapper, because that file format may only export async
  functions. There used to be a second, plain-cookie factory whose value was the
  literal `granted` — bypassable with `curl -H 'Cookie: tb_access=granted'` — and
  it is gone. **A page gate over a PUBLIC bucket is not protection**: it hides
  the listing while every object URL stays permanently reachable. So the gated
  galleries read through `listPrivateBucketImages()` (short-lived signed URLs,
  private bucket) and the open ones through `listPublicBucketImages()`. Current
  posture, all four gates: `TASTE BUDZ` (`/taste-budz`), `MAFIA terpz`
  (`/mafiaterpz` — the bucket does not exist in Supabase yet, so the page
  renders its empty state) and `premade-designs` (`/premadedesigns`) private +
  gated, plus `/martyig`, which is gated but backed by a committed
  `leads.json` rather than a bucket; `custom-work` (`/portfolio`) and `GSO`
  (`/gso`) public + open. `/designs` was a fifth gate over the *public* `GSO`
  and is retired — see **Routes & rendering**. The code lives only in
  `GALLERY_ACCESS_CODE`.
- **`cn()` helper:** `lib/utils.ts` merges classes with `clsx` + `tailwind-merge`; use it for conditional classNames.
- **Public pages share a CSS layer, not a utility string — use it on any new standalone route.** Four classes in `app/globals.css` replace what used to be copy-pasted into a dozen `<main>` tags, and each encodes a decision worth not re-litigating: **`.public-page`** is the shell padding (`max()`-based `env(safe-area-inset-*)` so landscape content clears the notch rail and the last control clears iOS Safari's floating toolbar; a smaller top pad on phones, resolving to the desktop 24/48px frame from `sm` up) — **do not go back to a bare `px-4 py-12`**; **`.public-title`** is the h1 scale (a `clamp()` rather than a breakpoint pair, because the interesting range is 320→430px and lives *inside* Tailwind's first breakpoint); **`.on-glass`** lifts muted text inside a tinted panel; and **`.text-on-photo`** is for text with no panel between it and the backdrop — it pairs a lifted tone with a two-layer per-glyph `text-shadow`, the one case here where a text-shadow is the right tool, since centred headers land on the brightest part of the image where even pure white is ~1.1:1. All four are **scoped to public routes**; the admin/portal shells keep their zinc palette untouched.
- **Two shared marks on public pages:** `HomeLogoLink` (`components/layout/home-logo.tsx`) at the top and `BackToStudiosLink` (`components/layout/public-page-link.tsx`) at the bottom — the latter is on 15 public routes, so add it to a new one rather than hand-rolling a back link.
- **`next.config.ts` is a required stop for four kinds of change** (each detailed in its own section below): adding a **cutline preset** or any other asset read with `fs` at runtime (`outputFileTracingIncludes` — unlisted assets are missing from the Vercel function); serving a new **static HTML site** from `public/` (`rewrites()` — the public folder doesn't resolve `index.html`); changing **portal upload / body-size** behavior (`experimental.serverActions.bodySizeLimit`, currently `4mb`); and enabling **remote images** (`images.remotePatterns` currently permits only short-lived signed Storage images for `/premadedesigns`).
- **The Vercel image optimizer is out of the delivery path — new images need `unoptimized` or a CSS background.** This project's image-optimization allowance is **exhausted**, so every *uncached* transform returns **402 and the image renders blank** — the worst failure mode there is, because it looks exactly like a broken asset rather than a quota error. The convention that follows is consistent across the repo and is **not** something to re-derive: every image whose source is remote, bucket-backed, generated, or a data URL passes **`unoptimized`** — `app/home-card.tsx`, `app/premadedesigns/gallery.tsx`, `app/login/animated-background.tsx`, `components/qr/qr-preview.tsx`, `components/qr/qr-code-list.tsx`, `components/mylar-printing/wizard-ui.tsx` — and pre-sizes the asset to its display size to buy back what the optimizer was doing. Galleries skip `next/image` altogether and use a plain `<img>`; `HomeMobileBackground` uses a CSS `background-image`. **The only five optimized `next/image` calls left are the static logo PNGs** (`/logo.png` in `components/layout/brand.tsx`, `components/layout/home-logo.tsx`, `components/portal/portal-shell.tsx`, `components/partner-jobs/partner-shell.tsx`; `/invoice-logo.png` in `app/(app)/invoices/[id]/page.tsx`) — a handful of fixed URLs at fixed sizes, i.e. a tiny cache set that stays warm, which is the pattern that lets them survive. Don't read them as precedent: **an image added without `unoptimized` is a blank box in production the first time it's requested.** `images.remotePatterns` in `next.config.ts` only *permits a host* — it does not opt anything out of the optimizer.
- **Forms, validation, toasts, dates:** Forms are Server-Action driven (`useActionState` against `ActionState`) — **not** react-hook-form. Input validation is **`zod`**, applied *server-side* inside the Server Actions (`app/actions/*` all import it); there is no client-side schema layer. `react-hook-form` + `@hookform/resolvers` were removed as unused — don't reach for them. User feedback is **`sonner`** toasts (`components/ui/sonner.tsx`). Date/currency formatting goes through `lib/format.ts` (backed by **`date-fns`**) — see Data flow.

## Architecture

A Supabase-backed invoicing app: clients, auto-numbered invoices with line items / tax / discounts, payments, and a dashboard. `README.md` covers the same ground at a shallower depth — features, the route tables, setup, and the deploy checklist — and is currently accurate; **update it alongside this file** when you add a route, a migration, an env var, or a bucket. It is the orientation doc, this is the architecture doc: where the two disagree, this file wins. The points below are the non-obvious wiring.

**Feature deep-dives live in `.claude/docs/` and are not loaded by default.** Each is the authority for its area; nothing in them is repeated here, so open the file rather than reasoning from this summary:

| File | Covers |
| --- | --- |
| `.claude/docs/database-schema.md` | every migration in order, the hand-maintained `lib/types/database.ts` mirror, and the three RLS shapes (owner-scoped, policy-less anonymous intake, company-scoped) |
| `.claude/docs/print-partner-portals.md` | the subdomain-addressed partner portals: routing, the keypad-into-auth gate, what a rep may write and which trigger decides it, jobs/items/files, thumbnails, the event→notification pipeline, studio-filed jobs, and invoices on jobs (TNT) |
| `.claude/docs/custom-mylar-printing.md` | the two public forms that persist — the mylar quote wizard (the reference implementation) and `/custom-design-request` — plus their admin intakes |
| `.claude/docs/client-portals.md` | portal logins, projects, the DAM file browser, direct-to-Storage admin uploads, and forced password change |
| `.claude/docs/portfolio-gallery.md` | the public galleries, the shared renderer, the keypad gate, and `/premadedesigns` in full |
| `.claude/docs/mockup-tools.md` | the four public, no-auth, zero-persistence print tools (three mockup generators + the Cutline Generator) |
| `.claude/docs/home-card.md` | the raffle-ticket home card: `BIO_LINKS` tiers, the showcase slideshow, the entrance animation's backdrop-filter trap, and the viewport-split backdrop |
| `.claude/docs/qr-platform.md` | static vs dynamic codes, the `/q/<slug>` redirect and privacy-preserving scan logging, client-side styling/rendering, generation history |
| `.claude/docs/mobile-app.md` | the Expo workspace: commands, stack, the anon-key/RLS constraint, PDF viewer, uploads, biometric lock |

### Routes & rendering

- Admin app lives under the `app/(app)/` route group, wrapped by `AppShell` (sidebar + mobile sheet nav). Client-portal pages live under the separate `app/(portal)/` group (`/portal/*`), wrapped by its own shell. Self-signup customers live under a third group, `app/(customer)/` (`/onboarding`, `/account`), gated by `requireCustomer()` in its `layout.tsx` (see **Auth & roles**). `app/page.tsx` (outside all groups) is the public sign-in screen, reused by `/login`. The sign-in card is a "link in bio" `HomeCard` (`app/home-card.tsx`) shaped like a raffle ticket, over a viewport-split backdrop — **read `.claude/docs/home-card.md` before editing either**. The other public/standalone pages share one brand mark, `HomeLogoLink` (`components/layout/home-logo.tsx`) — the circular logo linking to `/` (the proxy then routes authed visitors to their role home); the admin/portal shells use their own `Brand`/`PortalBrand` instead.
- **`/newpremades` was retired and now 308-redirects to `/premadedesigns`.** It was a second premade catalog with 42 designs committed to `assets/newpremades` as WebP (18 MB, ~58% of the repo). Its artwork was **not** in the Supabase catalog — 41 of 42 were unique and no bytes matched a `content_hash` — so retiring it dropped those designs from the site deliberately rather than merging them into the Supabase catalog. `/premadedesigns` is now the single premade source of truth.
- **`/designs` was retired and now 308-redirects to `/gso`.** It was a second view of the *same public* `GSO` bucket, behind the shared keypad — so the gate only hid the listing while every object URL stayed permanently reachable, which is not protection (see the gallery-gate bullet in **Conventions**). Rather than move the bucket private, the route was dropped in favor of `/gso`, the public-intent one. **Do not re-add a gated route over `GSO`**: a gate there is either theatre or a bucket migration, never a page.
- **Two superseded public forms were removed and now 308-redirect to `/mylar-printing`:** `/how-to-order` and `/mylar-bag-printing` (both Formspree, no DB). The redirects live in `next.config.ts`; config redirects resolve *before* `proxy.ts`, so neither needs a `PUBLIC_PATHS` entry.
- **Public (no-auth) pages live outside every group**, and each needs a `PUBLIC_PATHS` entry in `proxy.ts` (the full list is below). Most have a deep-dive: the galleries — `/portfolio`, `/whiteash` (a client proof gallery, public but `noindex`), `/taste-budz`, `/mafiaterpz`, `/gso`, `/martyig`, `/premadedesigns` — in `.claude/docs/portfolio-gallery.md`; the two forms that persist, `/mylar-printing` (the home card's primary CTA) and `/custom-design-request`, in `.claude/docs/custom-mylar-printing.md`; the four `/tools/*` in `.claude/docs/mockup-tools.md`; `/q/<slug>` in **QR codes** below; `/auth/callback` and `/sign-up` in **Auth & roles**. The rest: `/qr-generator` is the admin `QrGenerator` with `allowSave={false}`, reached by URL only (its old `/qr-generator/designs` child is now a `next.config.ts` redirect to `/premadedesigns`, which is unrelated to QR); **`/mylar` is not a React route** but a self-contained single-file static shop at `public/mylar/index.html` (no backend, client-side cart), served by a `rewrites()` entry because `public/` doesn't resolve `index.html`, and also reached by URL only.
- All four data-backed groups (`(app)`, `(portal)`, `(customer)`, `(partner)`) set `export const dynamic = "force-dynamic"` in their `layout.tsx` because every page reads from Supabase per request. Keep new data-backed pages inside the appropriate group.
- **Premade catalog ingestion:** `/premadedesigns` reads the service-role-only `list_premade_design_catalog()` database manifest. Run `bun run premade:sync:dry` to reconcile the local master folder, private Storage, and manifest; run `bun run premade:sync` to add only new SHA-256 designs. The additive migration is `20260922145436_premade_catalog_dedup.sql`; Supabase-only artwork is never deleted.
- `proxy.ts` (Next.js 16's renamed Middleware, Node.js runtime) runs on every request: it refreshes the Supabase session (rotating cookies), maps **print-partner hostnames and path aliases** onto the internal `/partner/<slug>/…` routes (see `.claude/docs/print-partner-portals.md`), and optimistically redirects unauthenticated users to `/login` and authenticated users away from it. **It no longer writes cookies straight onto a `NextResponse.next()`**: which response it returns (next / rewrite / redirect) isn't known until after the session is read, so rotated cookies are collected and applied to whichever one it ends up building — a refreshed session must survive all three. `PUBLIC_PATHS` = `/`, `/login`, `/sign-up`, `/reset-password`, `/qr-generator`, `/premadedesigns`, `/custom-design-request`, `/mylar-printing`, `/auth/callback` (the OAuth code exchange must be reachable before cookies exist), `/portfolio`, `/whiteash`, `/taste-budz`, `/gso`, `/martyig`, `/mafiaterpz`, `/tools/cutline-generator`, `/tools/mockup-generator`, `/tools/8pc-mockup-generator`, `/tools/bag-mockup-grid`, `/mylar` (+ `/mylar/index.html` — the matcher only skips image extensions, so the direct `.html` path needs allow-listing too), plus prefix matches for any `/q/<slug>` redirect. The proxy is **not** the real gate — enforcement is Postgres RLS plus `requireUser()`/`requireAdmin()`/`requirePortalUser()` in Server Components and Actions.

### Data flow

- **Reads:** `lib/queries/*.ts` holds the query helpers, one module per domain (`clients`, `invoices`, `qr`, `tasks`, `settings`, `portals`, `projects`, `dashboard`, `galleries`) — matching `lib/partner-jobs/queries.ts` and friends. The former catch-all `lib/data.ts` was split into these and deleted. They hold (`getInvoices`, `getInvoice`, `getDashboardStats`, the QR helpers `getQrCodes`/`getQrCodeById`/`getQrScanCounts`/`getQrScansForQrCode`/`getQrScanSummary`, etc.), called directly from Server Components. Display formatting (currency, dates) goes through the shared helpers in `lib/format.ts` — use them rather than ad-hoc `Intl`/`toLocaleString` calls so amounts and dates render consistently across pages.
- **Where a new module goes in `lib/` — three shapes, and the split is by what may reach the browser, not by domain.** (a) **`lib/queries/*.ts`** for a Supabase read, as above. (b) **`lib/<domain>.ts` at the root** for the **client-safe** half — constants, status/category labels, pure helpers imported by Client *and* Server Components: `portal.ts`, `dam.ts`, `projects.ts`, `tasks.ts`, `uploads.ts`, `invoice.ts`, `format.ts`, `portfolio.ts`. None of them import `server-only`, and that is the point; don't add a Supabase call to one. (c) **a folder per feature** for everything newer — `lib/{partner-jobs,mylar-printing,design-requests}/` with `queries.ts` / `schema.ts` / `types.ts` / `*-upload-client.ts` — which is where new work belongs. **The `-types.ts` sibling is a deliberate seam, not a stray file:** `lib/premade-designs.ts` and `lib/white-ash-gallery.ts` are `server-only`, so their pure helpers live next door in `lib/premade-designs-types.ts` / `lib/white-ash-gallery-types.ts` for the client gallery to import (the latter's header says so). Reach for `import "server-only"` whenever a new module touches the service-role client, Storage, or a secret.
- **Writes:** Server Actions in `app/actions/` (`"use server"`): `clients`, `invoices`, `settings`, `qr`, `tasks` (the dashboard task manager), and `profile` for the admin/customer app; `auth` (sign in/out, password reset), `portal` (admin-side portal-user + file management), `portal-client` (client-side portal uploads), `projects` (admin-only client-project CRUD — see `.claude/docs/client-portals.md`), `uploads` (mints signed upload URLs + finalizes admin direct-to-Storage uploads), `favorites` (per-user portal file stars), `design-requests` (the public custom-design form's anonymous-safe service-role uploads **and** its validated submission), `custom-design-requests` (the admin-only status write for those — split out from the public file for the same reason as `mylar-requests` below), `mylar-printing` (the public quote wizard's anonymous submission + artwork upload path), `mylar-requests` (the admin-only status write for those inquiries — kept in a separate file so the public wizard's bundle never references an admin endpoint), `partner-jobs` (the print-partner portal's upload tickets and job submission), `partner-job-edits` (the portal's *edit* half — update, delete and the two status writes; split out of a 795-line `partner-jobs.ts` because the two flows share only the constants in `lib/partner-jobs/action-constants.ts`, with no helpers or types crossing the seam), `admin-partner-jobs` (the admin-only status write for those — same split, same reason), `admin-partner-job-writes` (the studio filing and editing jobs *on a company's behalf* through the same `NewJobForm` — service role, company id bound as the first argument), `partner-job-invoices` (admin-only attach/detach of an invoice to a job), and the job payment log's two halves, `partner-job-payments` (rep, cookie-scoped) and `admin-partner-job-payments` (studio, service role). **The partner sign-in is deliberately NOT in `app/actions/`** — the keypad gate is a `"use server"` file colocated with the route it guards, at `app/(partner)/partner/[slug]/access.ts`, which is also where the literal code lives. **Every partner-side write ends with one `recordPartnerJobEvent()` call** — one event per *user action*, not per row touched, across the partner action files, and studio writes log one too with a `studio` actor (`lib/partner-jobs/events.ts`), which logs a `partner_job_events` row and hands the announcement to `lib/notifications/dispatch.ts` — the only notification seam in the codebase. See `.claude/docs/print-partner-portals.md`. They validate inputs, authenticate inside each action, then `revalidatePath(...)` the affected routes. Forms are client components using `useActionState` against the shared `ActionState` shape in `app/actions/types.ts` (`{ error?, fieldErrors?, success? }`) or progressive-enhancement forms with `useFormStatus`.
- **Graceful degradation:** every read/write first checks `isSupabaseConfigured()` and returns a safe fallback (empty array / `null` / a "not configured" error) when env vars are absent. This is deliberate — the app builds and the UI renders empty states with no database. Preserve this guard in new data code.
- **Caching: there is almost none, and that is the current posture — do not "modernize" it.** Every data-backed group is `force-dynamic`, and the whole repo holds exactly **one** cache: `unstable_cache` in `lib/premade-designs.ts` (60s, so a new premade upload appears within a minute rather than instantly), plus one `fetch` with `next: { revalidate: 300 }` for `/whiteash`. There is **no `use cache` / Cache Components anywhere, and no `export const revalidate`** — Next 16's headline caching feature is simply not enabled here, so don't read its absence as an oversight to fix in passing. `revalidateTag` is likewise never called, which makes the `tags: ["premade-designs"]` on that one cache **inert**: if you ever need an instant invalidation path, wiring that tag up is the change, not adding a second cache.

### Three Supabase clients (do not mix them)

1. **SSR client** — `lib/supabase/server.ts` (`createClient()`) and `client.ts`, via `@supabase/ssr`. Used by Server Components and Server Actions; RLS-scoped through the anon key + auth cookies. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Route-handler client** — `lib/supabase/with-supabase.ts` (`supabaseRoute(config, handler)`), via `@supabase/server`. **It is for the header-authenticated `apikey` endpoints, not for route handlers in general** — a route handler may use whichever of the three clients fits, and most do something else: of the handlers under `app/api/`, only `clients` and `health` use `supabaseRoute`, two use the SSR client above (`files/[fileId]`, `invoices/[id]/pdf`), three use the service-role client (`design-request-assets`, `mylar-artwork`, `partner-job-files`), and the three `*/generate` sharp+pdf-lib routes touch no Supabase at all. `ctx.supabase` is RLS-scoped; `ctx.supabaseAdmin` bypasses RLS. `auth: "secret"` requires the secret key in the `apikey` header; `auth: "none"` is for public endpoints (e.g. `app/api/health/route.ts`, an unauthenticated health check). Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`.
3. **Service-role admin client** — `lib/supabase/admin.ts` (`createAdminClient()`, guarded by `isSupabaseAdminConfigured()`), via `@supabase/supabase-js`. **Bypasses RLS.** Server-only, and only where the cookie-scoped client *structurally cannot* work — never as a convenience or a way around a policy that is merely inconvenient. **Three sanctioned shapes, and it is used widely, so a call site is not by itself a smell:** **(a)** auth-admin operations inside `requireAdmin()`-guarded Server Actions (`auth.admin.createUser` for portal logins); **(b)** reads and writes against tables that deliberately have **no `owner_id` and no user-reachable policy** — the anonymous-intake and company-scoped families, i.e. partner jobs (`lib/partner-jobs/*`, `app/actions/{partner-jobs,partner-job-edits,admin-partner-jobs,admin-partner-job-writes,admin-partner-job-payments}.ts`, and the PDF previews in `lib/partner-jobs/previews.ts`), mylar inquiries, custom-design requests, the premade manifest, `workspace_admins`/`workspace_owner`, and `qr_generations` (`/qr/history`); **(c)** Storage listings whose entire output is public filenames + URLs from an already-public bucket (`getPortfolioImages` over `custom-work`). Each of (b)'s families explains its own reason in `.claude/docs/` — read that before adding a call site, and if a new use fits none of the three shapes, it belongs on the SSR client. Never import it into a Client Component or return its results unfiltered — `admin.ts` carries `import "server-only"`, so a client import is a build error, and `scripts/*.ts` must not import it either (outside Next the package throws on import). Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

### Auth & roles

- **Auth is live** (Supabase Auth: email/password plus **Google OAuth**). Google sign-in starts from `app/login/google-sign-in-button.tsx` (`signInWithOAuth`, PKCE); Supabase redirects back to `app/auth/callback/route.ts`, which exchanges the code for a session (setting cookies via the SSR client) and lands the user on `roleHome()` — same role routing as `signInAction`. The `redirect` param carries the original destination through the round-trip; only same-origin in-app paths are honored. As a safety net, `app/page.tsx` forwards a stray `?code=` (when Supabase's Redirect URLs allowlist is missing `/auth/callback` and OAuth falls back to the Site URL) on to `/auth/callback` so the exchange still happens. Helpers in `lib/auth.ts`: `getUser()`/`requireUser()` (any session), `requireAdmin()`, `getPortalContext()`/`requirePortalUser()`, and `requireCustomer()`. Admins are created in the Supabase dashboard; portal users via the admin action; **customers self-sign-up at `/sign-up`**.
- **Four roles, with admin determined by an explicit allowlist — never inferred from missing data.** `roleHome()` encodes the precedence, and the order is load-bearing (admin → portal → partner → customer):
  1. **admin** — email is in the server-only `ADMIN_EMAILS` env allowlist (`isAdminEmail()`). Full `app/(app)` dashboard. **`ADMIN_EMAILS` must be set or no one can reach the dashboard.**
  2. **portal user** — has an active (`revoked_at is null`) `client_users` row. Confined to `/portal/*`, mapped to one client.
  3. **print-partner rep** — has an active `partner_users` row whose company is also active. Confined to that company's portal (see `.claude/docs/print-partner-portals.md`). Checked *after* the portal role so a user holding both keeps the access they had before partners existed, and *before* the customer fallback so a rep with no `profiles` row is never mistaken for an un-onboarded signup.
  4. **customer** — any other authenticated user (self-signup). **A customer is a portal APPLICANT, not a separate destination**: they live in the `(customer)` group at `/account/pending`, a dead-end "waiting for approval" screen, and the only thing between them and `/portal` is the `client_users` row an admin creates by approving them (see **Self-signup → portal approval**). `/onboarding` is now only the email-confirmation fallback, and `/account` is a bare redirect to `/account/pending`.
- **Security:** admin status lives *only* in config a user cannot write — the `ADMIN_EMAILS` env allowlist that gates routes, and its database counterpart `workspace_admins`, which is RLS-on-with-no-policies and reachable only by the service role (see **Workspace admin ownership**). Neither is user-writable, so a customer can never self-promote (the `profiles` table deliberately has no role column). `roleHome()` computes the right landing path and `signInAction` routes each role there. Admins read/manage `profiles` via the service-role client (`lib/supabase/admin.ts`), since profile RLS is owner-only. Migration: `0009_profiles.sql`.

### Workspace admin ownership — several admin logins, ONE dataset

`ADMIN_EMAILS` gates **routes**; Postgres cannot read it. So before migration `20260824193000`, every owner-scoped policy said `owner_id = auth.uid()` and a *second* admin passed `requireAdmin()`, reached `/dashboard`, and saw an empty app — worse, `0003`'s write policies rejected inserts into the shared dataset, so they could only fork a private one (burning numbers from the global `invoice_number_seq` on the way).

- **The fix remaps the identity; it never widens the predicate.** `public.current_owner_id()` (`SECURITY DEFINER`, fixed `search_path`, same shape as `portal_client_id()`) answers "which `owner_id` may I act as?" — the canonical workspace owner for a workspace admin, plain `auth.uid()` for everyone else. Policies became `owner_id = (select public.current_owner_id())`, wrapped in a `select` so Postgres hoists it into a once-per-statement InitPlan. Predicate *shape* is unchanged, so `with check` still blocks ownership reassignment and `0017`'s `exists (… clients c …)` hardening survives verbatim on every policy it added it to. **Never drop that sub-clause when editing these policies** — it is the whole of the `0017` fix.
- **Two tables, both unreachable by users.** `workspace_admins` (uid allowlist, mirroring `ADMIN_EMAILS`) and the singleton `workspace_owner` (the one uid every owner-scoped row is written under) run RLS with **no policies** and `revoke all … from anon, authenticated` — the anonymous-intake model from `20260822182058`. Only the service role and the `SECURITY DEFINER` helper read them, which is what keeps "admin" out of user-writable rows.
- **Portal users and workspace admins are mutually exclusive, enforced by a trigger pair** (`assert_not_portal_user` / `assert_not_workspace_admin`, both raising `42501`) rather than in application code, since a `check` constraint cannot see another table. Setting `revoked_at` still passes, so nothing blocks restoring a portal mapping.
- **`ownerId` and `userId` are different ids and are not interchangeable.** `currentOwnerId()` in `lib/auth.ts` calls the *same* RPC the policies use rather than recomputing the answer — a mismatch would fail `with check` and reject the write. Every `owner_id` column takes `ownerId`; **attribution columns (`actor_id`, `uploaded_by`) take `userId`**, so the activity timeline still shows which admin acted. `requireOwnedClient()` (`lib/action-helpers.ts`) returns both. A null from the RPC is an **error to surface** (`OWNER_RESOLVE_ERROR`), never a fall back to `user.id` — that fallback is exactly the forked-dataset bug this exists to prevent. Threaded through `clients`, `invoices`, `portal`, `projects`, `qr`, `settings`, `tasks`, `uploads`.
- **Deliberately not remapped:** `profiles` (owner-only; admins read it via the service role), `client_file_favorites.using` (a star is personal — only its client-ownership sub-clause moved), `file_activity.actor_id`, `qr_generations` (no policies), and `cutline_files_owner_all`. Existing rows were **not** re-owned — all 13 owner-scoped tables already belonged to one uid.
- **Storage is part of the fix, not an afterthought:** the `client-files` admin policy on `storage.objects` is remapped too, or other admins reach the file *rows* but not the *bytes*. Portal storage policies (`0004` insert, `0018` select) are untouched.
- **`npm run admin:sync` is the seeder the migration points at, and it now exists** (`scripts/sync-workspace-admins.ts`, plain Node + `--env-file=.env.local`, same shape as `client:create-marty`). It resolves every `ADMIN_EMAILS` address to its auth user, seeds `workspace_owner` from `ADMIN_EMAILS[0]` **only when that table is empty** (an existing owner is never repointed — that would move the whole dataset — only reported when it drifts out of `ADMIN_EMAILS`), inserts the missing `workspace_admins` rows, then audits the 11 owner-scoped tables it can re-own for rows stranded under a non-canonical admin uid (`client_file_favorites` has no `owner_id` and `qr_generations` has no policies, so both are deliberately outside that set — which is why 11 here and "13 owner-scoped tables" above are counting different things). **It is read-only without a flag**: `--adopt` re-owns those stranded rows (and adopts the null-owner `company_settings` row), `--prune` deletes `workspace_admins` rows whose email has left `ADMIN_EMAILS`. Attribution columns (`file_activity.actor_id`, `client_files.uploaded_by`, `qr_generations.owner_id`) are deliberately never remapped — they record who acted, not who owns. Adding an admin is still **two** allowlists: their email in `ADMIN_EMAILS`, then `npm run admin:sync`. If `workspace_owner` is empty the helper fails safe to `auth.uid()`, i.e. exactly the old behavior.
- **Known pre-existing bug, now fixable rather than merely documented:** the single `company_settings` row has `owner_id is null`, so no admin can see it — the settings page reads empty and `updateSettingsAction` inserts a *second* row instead of updating it. `npm run admin:sync -- --adopt` adopts it to the canonical owner (the migration's trailing comment still holds the equivalent one-line `update`). It predates the ownership work and is orthogonal to it, so nothing else depends on the order it is fixed in.
- **Verify as each admin with their own session, never as the service role** (which bypasses RLS and proves nothing). The migration's trailing comment holds the five checks: identity resolution, matching workspace counts, portal-user isolation, self-promotion refusal, and both directions of mutual exclusion.

### Self-signup → portal approval

How a stranger becomes a portal user. **No migration was needed for any of this** — the state is derived from tables that already existed.

- **Signup is one step.** `/sign-up` collects email, password, name, business name and — when Supabase issues a session immediately (email confirmation OFF) — `signUpAction` writes the `profiles` row itself and lands them on `/account/pending`. `phone`/`instagram` are still columns on `profiles` and still hold whatever pre-existing rows had, but are **no longer asked for**; every profile write is a partial upsert, so old values survive. With email confirmation ON there is no session to write a profile under, so the two names ride in the auth user's **metadata** and `/onboarding` prefills itself from them — a confirm-and-continue, not a second form. **`emailRedirectTo` points at `/auth/callback?redirect=/account/pending`, never at the destination directly**: Supabase appends `?code=` to that URL and only the callback exchanges it, so aiming the link at `/account/pending` (which is not in the proxy's `PUBLIC_PATHS`) meant the proxy saw no cookies, bounced to `/login`, and dropped the code on the way — a confirmed account that lands on a sign-in form. Reuse the existing callback for any future confirmation/recovery link rather than adding a second exchange point. (Metadata is self-asserted and grants nothing; it is only ever read back as a form default.)
- **"Pending" is derived, never stored.** A completed `profiles` row with no `client_users` row IS the pending state. Approval creates that row, which is what removes them from the queue — so there is no status column, no second source of truth, and nothing to keep in sync.
- **Two unique constraints, and they mean opposite things.** `client_users.user_id` is `UNIQUE` (0003) — one portal per person — and that is the idempotency guarantee: `approvePortalAccessAction` (`app/actions/portal.ts`) checks for an existing mapping first *and* catches `23505`, so a double-click, a concurrent approval, and a retry all converge on one client and one mapping. `client_users (client_id) where revoked_at is null` is UNIQUE too (`20260824022608`) — one active login per client — and losing *that* one is not idempotent at all: it means a different signup took the portal, so it reports an error. The two are distinguished by constraint name, never by the shared `23505` code. A **revoked** mapping is deliberately not resurrected here — re-granting is an explicit act on that client's portal page. A lost race that had already inserted a `clients` row deletes it again, so repeated approval never leaves empty duplicate clients behind.
- **Approval reuses an existing client, and refuses to guess.** It matches `clients.email` to the signup email through `normalizeEmail()` (`lib/portal.ts` — trim + lowercase only; it deliberately does *not* strip dots or `+tags`, since merging two real people would hand one customer another's files). Zero matches creates the client; exactly one links to it, so prior invoices/files/projects appear instantly; **two or more refuses with the names listed**, as does a matched client that already has an active portal login. Approval grants **access only**: new mappings get `can_upload: false` (the same default as the admin invite flow — uploads are enabled per client from that client's portal page when actually wanted) and `must_change_password: false`, since unlike the invite flow these users chose their own password at signup.
- **Trust boundary:** `requireAdmin()` runs before anything is read. The service-role client is used *only* to read the applicant's own `profiles` row (profile RLS is owner-only, so no admin policy exists to read it with) and to check mappings; **every write goes through the cookie-scoped client** and stays under the owner-scoped RLS from `0002`/`0017`. No policy was added, widened, or weakened.
- **Admin UI:** the `PendingPortalAccess` card at the top of `/dashboard` (`components/dashboard/pending-portal-access.tsx`, lucide icons, one `<form>` per row so approvals don't block each other). It renders nothing when the queue is empty. `getPendingPortalSignups()` in `lib/queries/portals.ts` re-asserts `requireAdmin()` itself and returns only the four display fields plus a single unambiguous client match.

### Invoice totals & status — computed in two agreeing places

- Totals (`subtotal`, `discount_amount`, `tax_amount`, `total`) are derived **both** in the browser via `calculateTotals()` in `lib/invoice.ts` (live preview while editing) **and** authoritatively in Postgres via triggers on save (`supabase/migrations/0001_initial_schema.sql`). Changing the formula means changing both. Server Actions never write totals directly — they write rates/items and let the triggers recompute.
- An invoice's stored `status` is not the whole story: `effectiveStatus()` in `lib/invoice.ts` treats a `sent` invoice past its `due_date` as `overdue` at read time. Use it for display rather than `invoice.status` directly.
- Invoice numbers (`TD-INV-0001`…) come from a Postgres sequence/trigger; never set `invoice_number` from app code.
- An invoice may bill a print-partner job (`invoices.design_job_id`, migration `20260926120000`). It is an ordinary invoice, not a second ledger, but it always bills the job's **company** client (`ensurePartnerCompanyClient()` in `lib/partner-jobs/invoicing.ts`) — `createInvoiceAction` ignores the typed client name when `design_job_id` is set. Details in `.claude/docs/print-partner-portals.md`.

### PDF export

- Invoice PDFs are generated server-side with **pdf-lib**. `lib/pdf/invoice-pdf-data.ts` maps an invoice to the PDF's data shape and `lib/pdf/invoice-pdf.ts` renders it. `app/api/invoices/[id]/pdf/route.ts` serves the download (`TD-INV-####.pdf`); the same data mapping feeds the emailed attachment so downloaded and emailed PDFs are identical.

### Email (Resend) — implemented

Transactional email is sent via **Resend** (`lib/email/`: `client.ts` exposes `getResend()`, `isResendConfigured()`, `EMAIL_FROM`; `templates.ts` holds the HTML).
- **Email an invoice:** `sendInvoiceAction` (`app/actions/invoices.ts`) renders + attaches the PDF, emails the client, and promotes a `draft` invoice to `sent`.
- **Portal invites:** `createPortalUserAction` (`app/actions/portal.ts`) emails a set-password link when Resend is configured, falling back to a one-time temp-password reveal otherwise.
- **Partner portal activity:** every meaningful event in a print-partner portal (a job filed, artwork added or removed, details changed, a status moved) emails the `ADMIN_EMAILS` addresses. Unlike the three flows above it does **not** call Resend directly — it goes through the channel-agnostic dispatcher in `lib/notifications/`, so the same event can gain an SMS channel without touching the code that produced it. `notificationEmail()` in `templates.ts` is the generic renderer that makes that possible: it knows nothing about what it is announcing, so a new event type needs no template. See `.claude/docs/print-partner-portals.md`.
- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (server-only). Both flows degrade gracefully when unset.

### QR codes

Static codes encode the destination; dynamic ones encode `/q/<slug>` so they can be repointed without reprinting, resolved through anon-executable `SECURITY DEFINER` RPCs rather than table grants. Styling, rendering and QR PDFs all run client-side. **Read `.claude/docs/qr-platform.md` before touching `components/qr/`, `lib/qr/`, `app/actions/qr.ts` or `/q/[slug]`.**

### Error handling & reporting

- **Six boundaries, placed by what they can actually catch.** `error.tsx` wraps a segment's page and nested layouts but **not the `layout.tsx` in its own segment** — and all four data-backed group layouts run an auth guard and are `force-dynamic`, so a Supabase failure throws *inside* the layout where the group's own boundary can never see it. That is what `app/global-error.tsx` is for; it replaces the root layout when it renders, so it gets no global stylesheet, no fonts and no theme class, and every style in it is inline by necessity. `app/error.tsx` is the catch-all for everything outside a route group — the sign-in card, `/login`, `/sign-up`, `/q/<slug>`, the galleries and the print tools — deliberately **one file rather than one per public folder**, since errors bubble to the nearest boundary. `(app)`, `(portal)`, `(customer)` and `(partner)` each own one because their escape hatch differs (dashboard / portal / home / stay put). The partner boundary offers **no navigation link at all**: its correct href depends on `partnerBasePath()`, which reads a proxy-set request header a Client Component cannot see, so any link written there would be right on one of the portal's three addresses and broken on the other two.
- **Use `retry`, not `reset`.** `retry()` re-fetches and re-renders the segment; `reset()` only clears the error state, which for a failed Supabase read just re-renders the same failure and looks broken. `retry` became stable in Next 16.3.0 and this project is on 16.3.1.
- **The digest is the only identifier safe to show a user.** In production Next replaces a Server Component's error message with a generic one plus `error.digest`, precisely so details don't reach the browser — so boundaries render "Reference &lt;digest&gt;" and never `error.message`.
- **`reportError()` in `lib/observability/report-error.ts` is the one seam a monitoring provider would be wired into.** No provider is installed; `deliver()` at the bottom of that file is the single function to change. It is **isomorphic on purpose** (the boundaries are Client Components, so it cannot be `server-only`), holds no secrets, and reads no env. It redacts context by key *and* by value shape, strips query strings from URLs (where Storage signed-URL tokens live), and reads only `message`/`code` off an error — **never Supabase's `details`/`hint`, which echo row values back** (`Key (email)=(…) already exists` is customer data).
- **It is deliberately NOT applied to most `console.error` calls.** The great majority already follow a good convention — `console.error("getClients", error.message)` then a safe fallback — which logs an operation name and a Postgres message, never the error object. That is the graceful-degradation pattern and rewriting it would be churn. `reportError()` is used where the old call was actively unsafe or lossy instead: the boundaries, and the three Storage-cleanup sites that logged **customer filenames** (`summarizePaths()` reduces a batch to a count and its file kinds). Match the surrounding file when adding a new one.

### PWA & mobile

- Ships a Web App Manifest (`app/manifest.ts`) and maskable icons; installable and launches standalone to `/dashboard`. Shells apply `env(safe-area-inset-*)` padding for notch/home-indicator safety, and invoice/line-item layouts have dedicated mobile treatments.

## Mobile companion app (`mobile/`)

`mobile/` is a **separate, self-contained Expo workspace** (SDK 54, Expo Router) excluded from the root `tsconfig`/eslint, with its own `node_modules` — run its commands from inside `mobile/`. It talks to the same Supabase project with the **anon key only, never a service-role key**, so every read and write is RLS-scoped exactly as on the web. Its DB types re-export the web `lib/types/database.ts`. **Read `.claude/docs/mobile-app.md` before any Expo work** — it covers commands, the PDF viewer's bearer-token dependency on `lib/supabase/server.ts`, direct-to-Storage uploads, and the biometric lock.

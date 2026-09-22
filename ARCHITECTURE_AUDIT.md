# tdstudiosny.com — Architecture & Health Audit

**Audit date:** 2026-08-31
**Commit audited:** `f051647` (branch `main`; tree was clean at audit start)

> **Tree state note.** Partway through this audit, three application files were modified from outside this audit session (`app/(app)/partner-jobs/[jobId]/page.tsx`, `app/(partner)/partner/[slug]/jobs/[jobId]/page.tsx`, `components/partner-jobs/download-all-files-button.tsx`) — an additive "Download all job files" button. Those edits were **not made by this audit**, were left in place, and do not affect any finding below. `npx tsc --noEmit` was re-run afterwards and still passes.
**Scope:** entire repository, excluding `node_modules/`, `.next/`, `.git/`, and the self-contained `mobile/` Expo workspace (surveyed but not deeply audited — it has its own toolchain).
**Nature:** read-only audit. No application code was modified.

> **How to read this report.** Findings marked **[CONFIRMED]** were verified by running a command or reading the file. Findings marked **[INFERENCE]** are reasoned conclusions that would need runtime or browser verification. Where a finding contradicts something the repo documents as deliberate, that is stated explicitly — this codebase carries an unusually detailed `CLAUDE.md`, and most apparent oddities turned out to be recorded decisions.

---

## Table of contents

1. [Phase 1 — Technology stack](#phase-1--technology-stack)
2. [Phase 2 — Repository map](#phase-2--repository-map)
3. [Phase 3 — Route inventory](#phase-3--route-inventory)
4. [Phase 4 — Internal link audit](#phase-4--internal-link-audit)
5. [Phase 5 — Dead page analysis](#phase-5--dead-page-analysis)
6. [Phase 6 — Component architecture](#phase-6--component-architecture)
7. [Phase 7 — Dead code](#phase-7--dead-code)
8. [Phase 8 — Dependencies](#phase-8--dependencies)
9. [Phase 9 — Code quality & refactoring](#phase-9--code-quality--refactoring)
10. [Phase 10 — Bugs & validation runs](#phase-10--bugs--validation-runs)
11. [Phase 11 — Images & assets](#phase-11--images--assets)
12. [Phase 12 — Performance](#phase-12--performance)
13. [Phase 13 — SEO](#phase-13--seo)
14. [Phase 14 — Accessibility](#phase-14--accessibility)
15. [Phase 15 — Security](#phase-15--security)
16. [Phase 16 — Configuration & environment](#phase-16--configuration--environment)
17. [Phase 17 — Architecture diagram](#phase-17--architecture-diagram)
18. [Phase 18 — Prioritized report](#phase-18--prioritized-report)

---

## Phase 1 — Technology stack

### Technology Stack Summary

| Area | Choice | Evidence |
| --- | --- | --- |
| Framework | **Next.js 16.3.1**, App Router, Turbopack | `package.json`, build log header |
| React | **19.2.4** (+ `react-dom` 19.2.4) | `package.json` |
| Language | **TypeScript 5**, `strict: true`, `noEmit` | `tsconfig.json` |
| Routing | App Router file-based; 4 route groups + public routes; **`proxy.ts`** (Next 16's renamed Middleware, Node runtime) | `app/`, `proxy.ts` |
| Styling | **Tailwind CSS v4** — no `tailwind.config.*`; theme lives in CSS via `@theme` | `app/globals.css`, `postcss.config.mjs` |
| UI library | **shadcn/ui**, style `radix-lyra`, base `neutral`, RSC on; primitives in `components/ui/` (13 files) | `components.json` |
| Icons | **Two** sets, split by area: `lucide-react` (64 imports) for older admin/portal, `@phosphor-icons/react` (48) for newer/public | import counts |
| Animation | **framer-motion** (5 imports) + hand-written CSS keyframes | `package.json`, `app/home-card.tsx` |
| Canvas/interaction | `konva` + `react-konva` (mockup tools only), `@dnd-kit/*` (bag grid only) | 1–2 imports each |
| Backend | Next.js **Server Actions** (19 files in `app/actions/`) + 11 **Route Handlers** under `app/api/` | `app/actions/`, `app/api/` |
| Auth | **Supabase Auth** — email/password + Google OAuth (PKCE); role helpers in `lib/auth.ts` | `app/auth/callback/route.ts` |
| Database | **Supabase Postgres**, 38 migrations, **RLS-first** | `supabase/migrations/` |
| Storage | Supabase Storage — 9+ buckets (public galleries, private client/partner/artwork) | migrations `0004`, `0021`, `0023`, `20260825120000` |
| Payments | **None.** No Stripe/PayPal/commerce SDK present | dependency scan |
| Forms | Server Actions + `useActionState` against `ActionState`; **zod** validation server-side (22 imports) | `app/actions/types.ts` |
| Analytics | **None.** No GA/Plausible/Vercel Analytics package | dependency scan |
| Email | **Resend** (`resend` 6.14.0), channel-agnostic dispatcher in `lib/notifications/` | `lib/email/`, `lib/notifications/` |
| CMS | **None** — content is Supabase buckets + static JSON (`app/martyig/leads.json`) | repo scan |
| Image handling | **`sharp`** server-side compositing; delivery via plain `<img>` (`next/image` deliberately avoided) | `lib/*/compose.ts`, eslint-disable comments |
| PDF | **`pdf-lib`** (invoices, cutlines, QR, mockups); `jszip` for browser-side bundling | `lib/pdf/`, `lib/cutline/` |
| Deployment | **Vercel** (`.vercel/project.json`, project `td-invoice-app`) | `.vercel/` |
| Env vars | 13 distinct names, all guarded by `isXConfigured()` helpers; `.env.example` is the template | `.env.example` |
| Package manager | **npm** (`package-lock.json`, 444 KB; no yarn/pnpm lock) | root listing |
| Build tooling | `next build` with **Turbopack** (`turbopack.root` pinned) | `next.config.ts` |
| Linting | **ESLint 9** flat config, `eslint-config-next` core-web-vitals + typescript | `eslint.config.mjs` |
| Formatting | **No Prettier config, no format script** | repo scan |
| Testing | **None.** No test runner, no test files, no CI workflow | repo scan |
| Monitoring | **None.** `app/(app)/error.tsx:17` carries `// TODO(observability): report to an error monitoring service.` | that file |

**Notable stack observations**

- **No `vercel.json` and no `vercel.ts`.** All platform config lives in `next.config.ts`. There is therefore **no Vercel Cron**, which `CLAUDE.md` already cites as the reason orphan-artwork cleanup is a manual task.
- **Two icon libraries ship together.** Documented and enforced per-file, but both are in the client bundle graph.
- **`react-hook-form` + `@hookform/resolvers` are installed and imported zero times** (see [Phase 8](#phase-8--dependencies)).

---

## Phase 2 — Repository map

```
td-invoice-app/
├── app/                          2.9M — App Router: every route, plus co-located route UI
│   ├── layout.tsx                root layout: fonts, metadataBase, Toaster, dark class
│   ├── page.tsx                  PUBLIC homepage — "link in bio" ticket card
│   ├── home-card.tsx             794 lines — BIO_LINKS + the whole ticket UI
│   ├── home-mobile-background.tsx / use-home-scroll.ts
│   ├── not-found.tsx             the ONLY 404 boundary
│   ├── manifest.ts               PWA manifest
│   ├── globals.css               Tailwind v4 theme + .public-page/.on-glass/.tk-* layers
│   ├── icon.png / apple-icon.png / opengraph-image.png / twitter-image.png
│   │
│   ├── (app)/                    ADMIN group — AppShell, force-dynamic, requireAdmin()
│   │   ├── error.tsx  loading.tsx
│   │   └── dashboard, clients, invoices, client-portals, qr, settings,
│   │       mylar-requests, design-requests, partner-jobs
│   ├── (portal)/                 CLIENT PORTAL group — PortalShell, requirePortalUser()
│   │   ├── error.tsx  loading.tsx
│   │   └── portal/{,, account, files, invoices, projects}
│   ├── (customer)/               SELF-SIGNUP group — requireCustomer()   [no error/loading]
│   │   └── account/pending, onboarding
│   ├── (partner)/                PRINT-PARTNER group — subdomain-addressed [no error/loading]
│   │   └── partner/[slug]/{,, login, jobs, jobs/new, jobs/[jobId], jobs/[jobId]/edit}
│   │
│   ├── actions/                  19 files — ALL Server Actions ("use server")
│   ├── api/                      11 Route Handlers (files, PDFs, generators, health)
│   ├── auth/callback/route.ts    OAuth PKCE exchange
│   ├── q/[slug]/                 public dynamic-QR redirect
│   └── <public routes>           portfolio, whiteash, taste-budz, gso, designs,
│                                 mafiaterpz, martyig, premadedesigns, qr-generator,
│                                 custom-design-request, mylar-printing,
│                                 mylar-bag-printing, how-to-order, sign-up,
│                                 login, reset-password, tools/*
│
├── components/                   652K — shared React, grouped by feature
│   ├── ui/                       13 shadcn primitives
│   ├── layout/                   AppShell, nav-config, Brand, HomeLogoLink, PageHeader
│   ├── shared/                   3 files: confirm-delete-dialog, empty-state, submit-button
│   ├── clients, invoices, dashboard, portal, qr, settings,
│   │   mylar-printing, mylar-requests, design-requests, partner-jobs
│
├── lib/                          468K — all non-React logic
│   ├── supabase/                 THREE clients: server.ts (SSR/RLS), with-supabase.ts
│   │                             (route handlers), admin.ts (SERVICE ROLE, bypasses RLS)
│   ├── auth.ts                   getUser/requireAdmin/requirePortalUser/requireCustomer/roleHome
│   ├── data.ts                   731 lines — core read helpers
│   ├── action-helpers.ts         requireOwnedClient, toFieldErrors
│   ├── types/database.ts         1324 lines — HAND-MAINTAINED schema mirror
│   ├── notifications/            channel-agnostic dispatcher (email only today)
│   ├── partner-jobs/  mylar-printing/  design-requests/  premade-designs*
│   ├── cutline/  mockup-generator/  bag-mockup-grid/  mockup/   (print tools)
│   ├── pdf/  qr/  email/         renderers
│   └── portal.ts dam.ts projects.ts tasks.ts invoice.ts format.ts uploads.ts utils.ts
│
├── public/                       4.6M — 26 files; static mylar shop; cutline preset PDF
├── scripts/create-marty-client.ts  idempotent portal bootstrap (the only script)
├── supabase/migrations/          38 SQL migrations (schema source of truth)
├── mobile/                       808K — SEPARATE Expo workspace, excluded from root tooling
├── proxy.ts                      Middleware: session refresh, partner host mapping, auth gate
├── next.config.ts                rewrites, redirects, outputFileTracingIncludes, images
├── CLAUDE.md / AGENTS.md / README.md / CLAUDE_SESSION_HANDOFF.md
└── (no vercel.json, no tests, no CI, no Prettier)
```

### Architecture in plain English

This is **one Next.js application serving four different audiences behind one domain**, plus a set of public marketing/tool pages.

A visitor hits `proxy.ts` first. It refreshes the Supabase session (rotating cookies onto whichever response it ends up returning), decides whether the request is addressed to a print-partner hostname and rewrites it into `/partner/<slug>/…` if so, and otherwise applies an *optimistic* auth redirect. It is explicitly **not** the security boundary.

The real boundary is **Postgres RLS**, re-asserted in application code by `requireAdmin()` / `requirePortalUser()` / `requireCustomer()` / `requirePartnerSession()`. Nearly every table carries an `owner_id` scoped through `current_owner_id()`; the exceptions are deliberate and documented — anonymous-intake tables (mylar inquiries, design requests) and workspace-identity tables run **RLS on with no policies**, reachable only by the service role, and the five partner tables scope by `partner_company_id()` instead of an owner.

Reads happen in Server Components through `lib/data.ts` and the per-feature `queries.ts` files. Writes happen exclusively in Server Actions under `app/actions/`, which validate with zod, authenticate inside the action, mutate, then `revalidatePath()`. File bytes deliberately **bypass Server Actions** wherever they can — the browser gets a signed upload URL and `PUT`s straight to Supabase Storage, which is what keeps the app under Vercel's request-body ceiling.

Route Handlers under `app/api/` exist for the things a Server Action cannot do: streaming a generated PDF/PNG back, and authorizing then 302-ing to a short-lived signed Storage URL. `/api` is outside the proxy matcher, so **each of those routes authenticates itself**.

The print tools (`/tools/*`) and the cutline generator are a distinct sub-architecture: zero persistence, zero auth, one multipart request in and one composed file out, with all limits mirrored in client- *and* server-safe modules so the browser rejects what the route would.

---

## Phase 3 — Route inventory

**Counts:** 60 `page.tsx` + 11 `route.ts` + 6 `layout.tsx`. The production build reports **77 route entries** (includes generated icon/manifest/OG assets).

"Internal links to it" counts inbound `href`/`redirect` references from a *different* file. `—` means none found.

### Public routes (no session)

| Route | Source file | Layout | Major components | Internal links to it | Status |
| --- | --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | root | `HomeCard`, `HomeMobileBackground`, `AnimatedBackground` | 6 | ACTIVE |
| `/login` | `app/login/page.tsx` | root | `AuthScreen`, `GoogleSignInButton` | 6 (redirects) + 2 href | ACTIVE |
| `/sign-up` | `app/sign-up/page.tsx` | root | signup form | 2 | ACTIVE |
| `/reset-password` | `app/reset-password/page.tsx` | root | recovery form | — | ACTIVE (reached by emailed link) |
| `/auth/callback` | `app/auth/callback/route.ts` | — | — | OAuth redirect target | ACTIVE |
| `/q/[slug]` | `app/q/[slug]/page.tsx` | root | — (302 only) | printed QR codes | ACTIVE |
| `/portfolio` | `app/portfolio/page.tsx` | root | `PortfolioGallery` | 3 (`BIO_LINKS`) | ACTIVE |
| `/whiteash` | `app/whiteash/page.tsx` | root | `WhiteAshGallery` | — | ACTIVE (share-by-link, `noindex`) |
| `/taste-budz` | `app/taste-budz/page.tsx` | root | `TasteBudzKeypad`, `PortfolioGallery` | — | ACTIVE (URL only, keypad) |
| `/designs` | `app/designs/page.tsx` | root | `TasteBudzKeypad`, `PortfolioGallery` | — | **DUPLICATE** (see below) |
| `/gso` | `app/gso/page.tsx` | root | `PortfolioGallery` | — | **DUPLICATE** (same bucket, ungated) |
| `/mafiaterpz` | `app/mafiaterpz/page.tsx` | root | `TasteBudzKeypad`, `PortfolioGallery` | — | ACTIVE (bucket may not exist yet) |
| `/martyig` | `app/martyig/page.tsx` | root | `MartyigTable` | — | ACTIVE (URL only, keypad) |
| `/premadedesigns` | `app/premadedesigns/page.tsx` | root | `DesignsGallery`, keypad | — | ACTIVE (URL only, deliberate) |
| `/qr-generator` | `app/qr-generator/page.tsx` | root | `QrGenerator` (`allowSave={false}`) | — | ACTIVE (button removed, URL only) |
| `/custom-design-request` | `app/custom-design-request/page.tsx` | root | request form | 3 (`BIO_LINKS`) | ACTIVE |
| `/mylar-printing` | `app/mylar-printing/page.tsx` | root | `MylarPrintingWizard` (5 steps) | 2 (`BIO_LINKS` prize + sticky CTA) | ACTIVE |
| `/mylar-bag-printing` | `app/mylar-bag-printing/page.tsx` | root | `MylarOrderForm` (Formspree) | — | POSSIBLY DEAD (superseded) |
| `/how-to-order` | `app/how-to-order/page.tsx` | root | static + Formspree | — | POSSIBLY DEAD (superseded) |
| `/mylar` | `public/mylar/index.html` via rewrite | none | static single-file site | — | POSSIBLY DEAD (CTA removed, in progress) |
| `/tools/cutline-generator` | `app/tools/cutline-generator/page.tsx` | root | `CutlineGenerator` | 1 | ACTIVE |
| `/tools/mockup-generator` | `app/tools/mockup-generator/page.tsx` | root | `MockupGenerator` | 2 | ACTIVE |
| `/tools/8pc-mockup-generator` | `app/tools/8pc-mockup-generator/page.tsx` | root | `MockupSheetGenerator` (Konva) | 1 | ACTIVE |
| `/tools/bag-mockup-grid` | `app/tools/bag-mockup-grid/page.tsx` | root | `BagMockupGrid` (dnd-kit) | 1 | ACTIVE |
| `/qr-generator/designs` | `next.config.ts` `redirects()` | — | — | legacy shared links | REDIRECT → `/premadedesigns` |
| `/_not-found` | `app/not-found.tsx` | root | — | — | ACTIVE |

### Admin routes — `app/(app)/`, `AppShell`, `requireAdmin()`

All 9 top-level entries are in `components/layout/nav-config.ts`, so all are reachable.

| Route | Source file | Major components | In nav | Status |
| --- | --- | --- | --- | --- |
| `/dashboard` | `(app)/dashboard/page.tsx` | `TaskManager`, `PendingPortalAccess` | ✅ | ACTIVE |
| `/clients`, `/clients/new`, `/clients/[id]` | `(app)/clients/**` | `ClientForm` | ✅ | ACTIVE |
| `/invoices`, `/invoices/new`, `/invoices/[id]` | `(app)/invoices/**` | `InvoiceForm`, `InvoicesTable`, `RecordPaymentDialog`, `SendInvoiceDialog` | ✅ | ACTIVE |
| `/mylar-requests`, `/mylar-requests/[id]` | `(app)/mylar-requests/**` | status form, artwork cards | ✅ | ACTIVE |
| `/design-requests`, `/design-requests/[id]` | `(app)/design-requests/**` | `StatusForm`, `StatusBadge` | ✅ | ACTIVE |
| `/partner-jobs`, `/partner-jobs/[jobId]` | `(app)/partner-jobs/**` | `AdminJobCompleteCheckbox`, `AdminStatusForm`, `JobFileList` | ✅ | ACTIVE |
| `/qr`, `/qr/[id]`, `/qr/history` | `(app)/qr/**` | `QrGenerator`, `QrCodeList`, `QrDetailEditor` | ✅ (`/qr`) | ACTIVE |
| `/client-portals`, `/client-portals/[clientId]` | `(app)/client-portals/**` | `CreatePortalUserDialog`, `ProjectList`, `AdminMultiUpload` | ✅ | ACTIVE |
| `/client-portals/[clientId]/projects/[projectId]` | same | `ProjectEditForm`, `FileList` | linked from client page | ACTIVE |
| `/client-portals/[clientId]/preview/**` (3 routes) | same | portal components re-rendered with client filters | linked from client page | ACTIVE ("view as client") |
| `/settings` | `(app)/settings/page.tsx` | settings form | ✅ | ACTIVE — **see known bug, Phase 10** |

### Client portal — `app/(portal)/`, `requirePortalUser()`

| Route | Source file | Major components | Status |
| --- | --- | --- | --- |
| `/portal` | `(portal)/portal/page.tsx` | `PortalOverviewContent`, `MustChangePasswordBanner` | ACTIVE |
| `/portal/projects`, `/portal/projects/[projectId]` | `(portal)/portal/projects/**` | `ProjectDetailContent` | ACTIVE |
| `/portal/files` | `(portal)/portal/files/page.tsx` | `FileBrowser` (833 lines) | ACTIVE |
| `/portal/invoices` | `(portal)/portal/invoices/page.tsx` | invoice summary | ACTIVE |
| `/portal/account` | `(portal)/portal/account/page.tsx` | password change | ACTIVE |

### Customer — `app/(customer)/`, `requireCustomer()`

| Route | Source file | Status |
| --- | --- | --- |
| `/account` | `(customer)/account/page.tsx` | ACTIVE — bare redirect to `/account/pending` |
| `/account/pending` | `(customer)/account/pending/page.tsx` | ACTIVE — dead-end "awaiting approval" |
| `/onboarding` | `(customer)/onboarding/page.tsx` | ACTIVE — email-confirmation fallback only |

### Print partner — `app/(partner)/`, subdomain-addressed

Reached three ways (`zazaorders.tdstudiosny.com/jobs`, `/zaza-orders/jobs`, `/partner/zaza/jobs`) via `resolvePartnerRoute()`.

| Route | Source file | Major components | Status |
| --- | --- | --- | --- |
| `/partner/[slug]` | `(partner)/partner/[slug]/page.tsx` | dashboard | ACTIVE |
| `/partner/[slug]/login` | `.../login/page.tsx` | `TasteBudzKeypad` (shared) | ACTIVE |
| `/partner/[slug]/jobs` | `.../jobs/page.tsx` | `JobTabs`, `JobsBrowser`, `JobCard` | ACTIVE |
| `/partner/[slug]/jobs/new` | `.../jobs/new/page.tsx` | `NewJobForm` (1028 lines) | ACTIVE |
| `/partner/[slug]/jobs/[jobId]` | `.../jobs/[jobId]/page.tsx` | `JobFileList`, `JobDoneCheckbox`, `JobActivity` | ACTIVE |
| `/partner/[slug]/jobs/[jobId]/edit` | `.../edit/page.tsx` | `NewJobForm` (edit mode) | ACTIVE |

### API routes

| Route | File | Auth model | Status |
| --- | --- | --- | --- |
| `/api/health` | `app/api/health/route.ts` | `auth: "none"` | ACTIVE |
| `/api/clients` | `app/api/clients/route.ts` | `auth: "secret"` (apikey header) | ACTIVE — **no internal caller found** |
| `/api/invoices/[id]/pdf` | `.../pdf/route.ts` | cookie-scoped + bearer forward | ACTIVE (3 hrefs + mobile app) |
| `/api/files/[fileId]` | `.../route.ts` | cookie-scoped RLS; `?inline=1`, `?thumb=1` | ACTIVE |
| `/api/partner-job-files/[fileId]` | `.../route.ts` | rep = RLS client, admin = service role | ACTIVE |
| `/api/mylar-artwork/[inquiryId]` | `.../route.ts` | own `requireAdmin()` | ACTIVE |
| `/api/design-request-assets/[requestId]` | `.../route.ts` | own `requireAdmin()` | ACTIVE |
| `/api/cutline/generate` | `.../route.ts` | **none** (public tool) | ACTIVE |
| `/api/mockup-sheet/generate` | `.../route.ts` | **none** (public tool) | ACTIVE |
| `/api/bag-mockup-grid/generate` | `.../route.ts` | **none** (public tool) | ACTIVE |

### Missing route files

| Missing | Impact |
| --- | --- |
| `app/sitemap.ts` | **[CONFIRMED]** no sitemap exists anywhere — see Phase 13 |
| `app/robots.ts` / `public/robots.txt` | **[CONFIRMED]** neither exists — see Phase 13 |
| `app/global-error.tsx` | a root-layout render error has no boundary |
| `app/(customer)/error.tsx` + `loading.tsx` | group has neither |
| `app/(partner)/error.tsx` + `loading.tsx` | group has neither |
| `error.tsx` on public routes | a Storage failure on a gallery renders the framework default |

---

## Phase 4 — Internal link audit

Method: extracted every `href="/…"`, `` href={`…`} ``, `redirect("…")`, `router.push/replace("…")` from `app/` and `components/`, then checked each destination against the built route list.

### Result: **zero broken internal links.**

Every literal `href` target resolves to a real route:

```
/  /dashboard  /clients  /clients/new  /invoices  /invoices/new  /qr  /qr/history
/portal  /portal/account  /portal/projects  /partner-jobs  /mylar-requests
/design-requests  /client-portals  /custom-design-request  /login  /sign-up
/tools/mockup-generator  /tools/cutline-generator  /tools/8pc-mockup-generator
/tools/bag-mockup-grid
```

Every dynamic `` href={`…`} `` template resolves to a real dynamic segment (`/invoices/${id}`, `/clients/${id}`, `/qr/${id}`, `/partner-jobs/${id}`, `/mylar-requests/${id}`, `/design-requests/${id}`, `/client-portals/${id}/…`, `/api/files/${id}`, `/api/invoices/${id}/pdf`).

Every `redirect()` target resolves: `/login`, `/login?reset=success`, `/account/pending`, `/onboarding`, `/portal`, `/dashboard`, `/clients`, `/invoices`.

### Clean results on every anti-pattern checked

| Anti-pattern | Occurrences |
| --- | --- |
| `href="#"` | **0** |
| `href=""` | **0** |
| `href="javascript:…"` | **0** |
| TODO/placeholder links | **0** |
| Clickable `<div>`/`<span>` with `onClick` | **0** |
| `target="_blank"` missing `rel` | **0** (all 11 real occurrences carry `rel`; the 4 apparent misses at `app/home-card.tsx:260`, `app/how-to-order/page.tsx:79`, `app/mylar-bag-printing/page.tsx:44`, `app/mylar-printing/page.tsx:16` are **comments** explaining why `_blank` is *not* used on `sms:` links) |
| Trailing-slash inconsistency | **0** — no route is referenced both with and without |

### The one link-shaped finding

| Source | Destination | Exists? | Problem |
| --- | --- | --- | --- |
| `app/home-card.tsx` `BIO_LINKS` "Premade Designs" tile | `https://instagram.com/tdstudiosco` | ✅ external | **[CONFIRMED, deliberate]** The tile named for `/premadedesigns` points at Instagram instead. `CLAUDE.md` explicitly warns: *"don't 'fix' that href to `/premadedesigns`."* Recorded here so a future reader does not treat it as a bug. |

**`BIO_LINKS` is the entire public link surface of the site** — 5 entries: `/mylar-printing` (`tier: "prize"`, `sticky`), `sms:+1929…`, `/custom-design-request`, Instagram, `/portfolio`. Everything else public is URL-only.

---

## Phase 5 — Dead page analysis

Eleven public routes have **no inbound internal link**. Critically, **`CLAUDE.md` documents almost all of them as deliberate**, so this section is about visibility, not deletion.

| Route | Classification | Reasoning |
| --- | --- | --- |
| `/whiteash` | **LIKELY INTENTIONAL** | Client proof gallery, `robots: { index: false }`, shared by link to ~166-design client. Explicitly documented. |
| `/reset-password` | **LIKELY INTENTIONAL** | Reached only via emailed recovery link; must not be in nav. |
| `/premadedesigns` | **LIKELY INTENTIONAL** | Keypad-gated, 2,312 images; `CLAUDE.md` says the bio tile deliberately points elsewhere. |
| `/taste-budz`, `/mafiaterpz`, `/martyig` | **LIKELY INTENTIONAL** | Keypad-gated semi-private pages, "reached by URL only" per docs. |
| `/qr-generator` | **LIKELY INTENTIONAL** | Home-card button was removed; still allow-listed and functional. |
| `/gso` | **NEEDS MANUAL REVIEW** | Renders the **same bucket** as `/designs` but with **no keypad gate**. See Phase 15 — this is a gate bypass, not just an orphan. |
| `/designs` | **NEEDS MANUAL REVIEW** | Same data as `/gso`. One of the two is redundant; which one depends on whether the GSO bucket is meant to be gated at all. |
| `/mylar-bag-printing` | **SAFE TO INVESTIGATE FOR REMOVAL** | Explicitly superseded by the `/mylar-printing` wizard. Still posts to **Formspree** and creates **no order record**, so orders placed here exist only in an inbox. Kept reachable so old links work. |
| `/how-to-order` | **SAFE TO INVESTIGATE FOR REMOVAL** | Same story — superseded, Formspree-backed, unlinked. |
| `/mylar` | **NEEDS MANUAL REVIEW** | 290 KB static shop; CTA removed "while the shop is in progress". Whether it ships is a business decision, not a code one. |

**[INFERENCE]** The pattern here is a deliberate "soft retirement" — routes stay reachable so previously shared links don't 404. That is a sound choice. The risk it creates is that **without a sitemap or `noindex`, search engines may still surface superseded pages** (`/mylar-bag-printing`, `/how-to-order`) alongside the current one, splitting intent. See Phase 13.

---

## Phase 6 — Component architecture

**Inventory:** 190 `.tsx` + 106 `.ts` files. 91 of 190 `.tsx` files (**48%**) declare `"use client"`.

### Oversized components

| File | Lines | Assessment |
| --- | --- | --- |
| `components/partner-jobs/new-job-form.tsx` | **1028** | **[CONFIRMED]** The largest component. Serves both create and edit, manages per-product items, per-item file attachment, client-side id minting, upload orchestration, and validation. Genuinely doing 4+ jobs. |
| `components/portal/file-browser.tsx` | **833** | Sidebar views, search, sort, grid/list, thumbnails, preview modal, favorites, version grouping. Domain helpers already extracted to `lib/dam.ts`; the *view* remains monolithic. |
| `app/home-card.tsx` | **794** | `BIO_LINKS` data + ticket layout + `SocialRow` + three-mode flip (bio/signin/forgot) + an inline `<style>` block. |
| `components/mylar-printing/mylar-printing-wizard.tsx` | **755** | 5-step wizard; step bodies *are* already separate components, so this is the orchestrator. Most defensible of the four. |
| `app/tools/8pc-mockup-generator/mockup-sheet-generator.tsx` | **733** | Konva preview + slot state + export orchestration. |
| `components/portal/admin-multi-upload.tsx` | **503** | Mint → XHR PUT → finalize, per-file progress state machine. |

### Confirmed duplication

**1. Four near-identical keypad gates — [CONFIRMED]**

`app/taste-budz/access.ts` (38), `app/designs/access.ts` (38), `app/mafiaterpz/access.ts` (39), `app/martyig/access.ts` (39). A `diff` shows they differ **only** in cookie name, cookie path, and function names. The `ACCESS_CODE` (`"0420"`), `COOKIE_VALUE`, `COOKIE_MAX_AGE`, cookie flags and action shape are byte-identical.

```
< const TASTE_BUDZ_COOKIE = "tb_access";      > const DESIGNS_COOKIE = "designs_access";
< export async function hasTasteBudzAccess()  > export async function hasDesignsAccess()
<     path: "/taste-budz",                    >     path: "/designs",
```

`app/premadedesigns/access.ts` (131) and `app/(partner)/partner/[slug]/access.ts` (193) are genuinely different (signed cookies, throttling, real sign-in) and should **not** be folded in.

**Recommended:** a `createKeypadGate({ cookie, path, code })` factory in `lib/keypad-gate.ts`, leaving 4 four-line call sites. **This also fixes the security finding in Phase 15 in one place instead of four.**

**2. Four near-identical gallery pages — [CONFIRMED]**

`app/taste-budz/page.tsx` (74), `app/designs/page.tsx` (75), `app/mafiaterpz/page.tsx` (80), `app/gso/page.tsx` (38). A `diff` shows ~85% identical structure: same imports, same `metadata` shape, same `force-dynamic`, same gate-then-render flow, same `<main className="public-page on-glass …">`, same `PortfolioGallery` handoff. They differ in bucket helper, logo, title, and empty-state copy.

**Recommended:** a `GatedGalleryPage` component or `createGalleryPage(config)` factory taking `{ title, description, logo, logoClassName, bucketReader, gate, emptyTitle, emptyHint }`. Collapses ~270 lines to ~4 configs. **`CLAUDE.md` already frames adding a gallery as "new bucket → 3-line helper → page → allow-list"** — this would make that literally true.

**3. `sniffImageMagic()` implemented three times — [CONFIRMED]**

| File | Line | Signature |
| --- | --- | --- |
| `lib/mockup-generator/limits.ts` | 38 | `"jpg" \| "png" \| "webp" \| null` |
| `lib/bag-mockup-grid/limits.ts` | 41 | `"jpg" \| "png" \| "webp" \| null` |
| `lib/cutline/limits.ts` | 38 | `"jpg" \| "png" \| null` |

Two are identical; the third narrows the union. This is **magic-byte sniffing used as a security control** on three public unauthenticated upload endpoints — exactly the kind of code that should have one implementation. **Recommended:** `lib/image-magic.ts` exporting the widest form, with each tool narrowing via its own allowlist.

**4. Repeated glass-panel class strings — [CONFIRMED]**

```
4x  "flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/40 p-8
     text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md"
4x  "flex flex-col gap-5 rounded-2xl border border-white/10 bg-black/40 p-6
     shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
```

The project **already has the right pattern** for this — `app/globals.css` defines `.public-page`, `.public-title`, `.on-glass`, `.text-on-photo` precisely to stop class-string copy-paste. These two panels should become `.glass-panel` / `.glass-panel-centered` in the same layer.

(`.public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden` appears 18x, but that is the documented shell string and is fine.)

### Components confirmed unused

| Component | Evidence |
| --- | --- |
| `components/ui/dropdown-menu.tsx` | **[CONFIRMED]** `grep -rn "dropdown-menu\|DropdownMenu"` across `app/`, `components/`, `lib/` returns **zero** hits outside the file itself. `CLAUDE.md` lists it among four shadcn primitives hand-swapped to Phosphor icons — so it was maintained but never rendered. |

Every other `components/ui/*` primitive is used (`button` 72, `label` 34, `input` 29, `card` 26, `select` 18, `badge` 15, `textarea` 12, `dialog` 11, `table` 10, `sheet` 2, `slider` 1, `sonner` 1).

### False positives worth recording

- `lib/notifications/channels/index.ts` initially appeared unreferenced; it is imported as a **directory** (`@/lib/notifications/channels` at `lib/notifications/dispatch.ts:4`). **Not dead.**
- `shadcn` appeared to have 0 code imports; it is consumed by **CSS** (`@import "shadcn/tailwind.css"` at `app/globals.css:3`). **Not an unused dependency.**
- `tw-animate-css` likewise — `@import "tw-animate-css"` at `app/globals.css:2`. **Not unused.**

---

## Phase 7 — Dead code

### The good news first

| Check | Result |
| --- | --- |
| `any` types in `app/`, `components/`, `lib/` | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `dangerouslySetInnerHTML` | **0** |
| `console.log` in application code | **0** (7 occurrences, all in `scripts/create-marty-client.ts`, all legitimate CLI output) |
| Commented-out legacy code blocks | none found |
| `FIXME` / `HACK` / `XXX` | **0** real ones (3 matches are the literal string `MYL-XXXXXX` / `DES-XXXXXX` in reference-format docs) |
| `eslint-disable` | 10, **all** `@next/next/no-img-element`, all with a documented reason |

### Dead Code Candidates

| Item | Location | Why it looks unused | Confidence | Recommended action |
| --- | --- | --- | --- | --- |
| `DropdownMenu` primitive | `components/ui/dropdown-menu.tsx` | Zero references anywhere; no `DropdownMenu` JSX in the repo | **HIGH** | Remove, or keep intentionally and note why (it *is* a shadcn primitive that may be re-added by the CLI) |
| `next.svg` | `public/next.svg` | 0 references; Next.js starter leftover | **HIGH** | Delete |
| `vercel.svg` | `public/vercel.svg` | 0 references; starter leftover | **HIGH** | Delete |
| `globe.svg` | `public/globe.svg` | 0 references; starter leftover | **HIGH** | Delete |
| `window.svg` | `public/window.svg` | 0 references; starter leftover | **HIGH** | Delete |
| `file.svg` | `public/file.svg` | 0 references; starter leftover | **HIGH** | Delete |
| `react-hook-form` | `package.json` dep | 0 imports; `CLAUDE.md` states forms are Server-Action driven and says "don't reach for them" | **HIGH** | Uninstall |
| `@hookform/resolvers` | `package.json` dep | 0 imports; same | **HIGH** | Uninstall |
| `hooks` path alias | `components.json` `aliases.hooks` → `@/hooks` | **[CONFIRMED]** no `hooks/` directory exists at root or under `components/` | **MEDIUM** | Harmless until the shadcn CLI generates a hook; either create the dir or drop the alias |
| `partner_done_at` column | `lib/types/database.ts:903,916` | Retired by `20260829180000`; read by **zero** application files | **LOW** | **Leave.** Deliberately kept for a release; the migration's trailing comment holds the `drop column` |
| `cutline-files` bucket | migration `0015` | Feature became storageless; bucket is never written | **LOW** | **Leave.** Documented; hosted Supabase blocks SQL bucket drops |
| `job.done_changed` event type | `lib/partner-jobs/types.ts:328` | No action emits it since `20260829180000` | **LOW** | **Leave** — historical rows still render it. (Comment at line 353 is stale, see Phase 9) |

### The one real TODO

```
app/(app)/error.tsx:17  // TODO(observability): report to an error monitoring service.
```

**[CONFIRMED]** This is the only actionable TODO in the repo, and it points at a genuine gap — there is **no error reporting anywhere**. 115 `console.error` calls exist across `app/`, `components/`, `lib/`; in production on Vercel these land in function logs with no alerting, aggregation, or ownership. See Phase 18.

---

## Phase 8 — Dependencies

Method: for every dependency, counted `from '<pkg>'` / `require('<pkg>')` across `app/`, `components/`, `lib/`, `scripts/`, and all config files — then manually verified every zero.

### Confirmed unused

| Package | Imports | Recommendation |
| --- | --- | --- |
| `react-hook-form` | **0** | Remove. `CLAUDE.md` states the project deliberately uses Server Actions + `useActionState` and instructs not to use it. |
| `@hookform/resolvers` | **0** | Remove — it only exists to bridge zod into react-hook-form. |

Removing both drops two packages and their transitive trees from the install graph. Neither is in the client bundle today (unimported code is tree-shaken), so **this is a hygiene and install-time win, not a runtime one**.

### Misclassified, not unused

| Package | Issue | Recommendation |
| --- | --- | --- |
| `shadcn` (4.11.0) | Listed in **`dependencies`**, but it is a CLI *and* a CSS source (`@import "shadcn/tailwind.css"`, `app/globals.css:3`) | **[INFERENCE]** Because the CSS import is resolved at build time, this arguably belongs in `devDependencies`. Verify the Vercel build still resolves the `@import` before moving — if the build installs prod deps only, moving it **will break the build**. Low priority, non-zero risk. |

### Single-use dependencies (all justified — no action)

| Package | Sole use | Verdict |
| --- | --- | --- |
| `konva` + `react-konva` | 8-piece mockup preview only | Keep — Konva does what canvas-by-hand would cost weeks |
| `@dnd-kit/*` (3 pkgs) | bag-mockup-grid reordering only | Keep |
| `react-social-icons` | one Instagram badge in `app/home-card.tsx` | **[INFERENCE]** A whole icon package for **one** mark. `CLAUDE.md` notes Cash App / SMS / Chime were hand-built to match its 40px circle — so the fourth could be too, dropping the dep. Low value, low risk. |
| `@developer-hub/liquid-glass` | `app/home-card.tsx`, `app/login/login-panel.tsx` | Keep — 2 uses, distinctive visual |
| `qrcode` | `lib/qr/render.ts` | Keep |
| `jszip` | 3 browser-side ZIP builders | Keep — avoids proxying 20×50 MB through a function |

### Duplicate-purpose libraries

| Overlap | Detail | Verdict |
| --- | --- | --- |
| `lucide-react` (64) **+** `@phosphor-icons/react` (48) | Two full icon sets | **[INFERENCE]** Documented and enforced per-file, so it is a *decision*, not drift. But it is real client-bundle weight in both admin and public routes. Consolidating on Phosphor (already the `components.json` `iconLibrary`) would be a large mechanical change with a measurable payoff. **Not urgent.** |
| `framer-motion` (5) **+** hand-written CSS keyframes | Both used for animation | Justified — `CLAUDE.md` explains the landing page deliberately avoids waiting on framer-motion to hydrate |

### Version health

- **No conflicts detected.** `next` 16.3.1 and `eslint-config-next` 16.3.1 are pinned in lockstep; `react`/`react-dom` both exactly 19.2.4; `@next/swc-darwin-arm64` correctly pinned in `optionalDependencies`.
- `sharp` is listed twice in `allowScripts` (`0.34.5` and `0.35.2`) while only `^0.35.2` is a dependency. Harmless stale entry.
- **No dependency upgrades are recommended in this audit** (out of scope, and the stack is current).

---

## Phase 9 — Code quality & refactoring

### Finding 9.1 — `new-job-form.tsx` is doing four jobs

- **File:** `components/partner-jobs/new-job-form.tsx` (1028 lines)
- **Issue:** Single client component owning: product-item CRUD with browser-minted UUIDs, per-item file attachment, job-level file attachment, full-form validation, and the sequential upload → submit orchestration. Used by **both** `/jobs/new` and `/jobs/[jobId]/edit`.
- **Why it matters:** It is the highest-traffic write path in the partner portal and the hardest file in the repo to change safely. Its two callers have materially different semantics (create mints everything; edit reconciles by id and must not orphan Storage objects), and both paths live in one component.
- **Severity:** **MEDIUM**
- **Recommended refactor:** Extract three units — `useJobItems()` (item array + id minting + reconciliation), `useJobUploads()` (mint/PUT/progress/retry, mirroring the existing `components/portal/admin-multi-upload.tsx` state machine), and `JobItemCard` (per-product row). Leave the form as layout + submit.
- **Expected benefit:** ~1028 → ~350 lines; the upload state machine becomes testable in isolation; create/edit divergence becomes explicit.

### Finding 9.2 — Keypad gate logic copy-pasted four times

- **Files:** `app/{taste-budz,designs,mafiaterpz,martyig}/access.ts`
- **Issue:** Four byte-identical implementations differing only in three constants (Phase 6).
- **Why it matters:** This is **security-relevant** code (see Phase 15.2). Any hardening — throttling, timing-safe compare, code rotation — currently has to be applied four times, and a miss is silent.
- **Severity:** **MEDIUM** (raised from LOW because of the security coupling)
- **Recommended refactor:** `lib/keypad-gate.ts` exporting `createKeypadGate({ cookieName, path, code })` returning `{ hasAccess, enterCodeAction }`.
- **Expected benefit:** 154 lines → ~50 + 4 call sites; one place to harden.

### Finding 9.3 — Gallery pages copy-pasted four times

- **Files:** `app/{taste-budz,designs,mafiaterpz,gso}/page.tsx`
- **Issue:** ~85% identical (Phase 6).
- **Severity:** **LOW**
- **Recommended refactor:** `createGalleryPage(config)` or a `<GatedGallery>` server component.
- **Expected benefit:** Adding gallery #5 becomes a config object; the SEO/metadata shape stops drifting per page (today `/gso` has no `openGraph` block while its three siblings do).

### Finding 9.4 — `sniffImageMagic()` triplicated on public upload paths

- **Files:** `lib/{mockup-generator,bag-mockup-grid,cutline}/limits.ts`
- **Issue:** Three implementations of a security control; one has a narrower return type.
- **Why it matters:** These guard three **unauthenticated** endpoints. A future fix (e.g. handling a malformed WebP header) applied to one copy leaves two exposed.
- **Severity:** **MEDIUM**
- **Recommended refactor:** `lib/image-magic.ts` with one widest-union implementation; each tool narrows via its own allowlist constant.
- **Expected benefit:** One place to correct; the deliberate per-tool format differences stay explicit as data instead of as divergent code.

### Finding 9.5 — Stale in-code comments contradicting shipped behavior

- **File/line:** `lib/partner-jobs/types.ts:353`
- **Issue:** The comment explains `job.done_changed`'s absence from `NOTIFIABLE_PARTNER_JOB_EVENTS` as a live product decision ("a rep ticking their own checkbox is their own bookkeeping"). Since `20260829180000`, **no action emits that event at all** — the rep's checkbox now emits `job.status_changed`, which *is* notifiable. `README.md:646` repeats the stale framing.
- **Why it matters:** This codebase's comments are unusually load-bearing — they are the primary design record. A confidently-worded stale comment is more dangerous here than in a codebase nobody trusts the comments in.
- **Severity:** **LOW** (documentation), **MEDIUM** (risk of acting on it)
- **Recommended fix:** Reword to "vestigial — retained so historical rows render". (`CLAUDE.md` was corrected during this session; the code comment and README were not.)

### Finding 9.6 — Repeated glass-panel class strings

- **Files:** 8 occurrences across public pages (Phase 6)
- **Severity:** **LOW**
- **Recommended refactor:** `.glass-panel` in `app/globals.css`, matching the existing `.public-page` / `.on-glass` layer.

### Finding 9.7 — `lib/data.ts` is a 731-line mixed-concern module

- **File:** `lib/data.ts`
- **Issue:** Holds invoice reads, dashboard stats, QR helpers, portal reads, pending-signup queries, **and** the public-bucket gallery listing (`listPublicBucketImages` at line 590). Newer features (`lib/partner-jobs/queries.ts`, `lib/mylar-printing/queries.ts`, `lib/design-requests/queries.ts`) correctly got their own modules.
- **Why it matters:** Anything importing one invoice helper pulls the module's whole import graph.
- **Severity:** **LOW**
- **Recommended refactor:** Split out `lib/galleries.ts` (bucket listing + the 4 thin helpers) and `lib/invoices/queries.ts`, following the pattern the newer features already set.

### Non-findings worth recording

These were checked and are **clean**: no `any`, no `@ts-ignore`, no magic-number sprawl (limits are named constants in `limits.ts` modules), no hardcoded URLs (`getSiteUrl()` / `metadataBase` centralize it), consistent `ActionState` error shape across ~20 forms, consistent zod-in-the-action validation, no derived state stored in `useState`, and modest `useEffect` counts (max 5 in any file).

---

## Phase 10 — Bugs & validation runs

### Validation commands — all three pass

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ **exit 0**, zero errors |
| `npm run lint` | ✅ **exit 0**, zero warnings |
| `npm run build` | ✅ **exit 0** — compiled in 1.3s, TypeScript in 2.2s, 24 static pages generated, 77 routes emitted |
| tests | ⚠️ **none exist** |

This is a strong result and the single best signal about this codebase's health.

> **Note on bundle analysis:** Next 16 + Turbopack's build output does **not** print the per-route "First Load JS" table that older Next versions did. Bundle-size claims in Phase 12 are therefore **[INFERENCE]** from import graphs and file sizes, not measured. Measuring would need `@next/bundle-analyzer` or inspecting `.next/`.

### Known bug — documented, still live

| Item | Detail |
| --- | --- |
| **Settings row is invisible to every admin** | `CLAUDE.md` records this: the single `company_settings` row has `owner_id IS NULL`, so no admin's RLS predicate matches it. `/settings` reads empty, and `updateSettingsAction` **inserts a second row** rather than updating the first. The one-line adoption `UPDATE` sits in migration `20260824193000`'s trailing comment, unapplied. **[CONFIRMED via documentation; not verified against the live database in this read-only audit.]** |

### Potential issues found by inspection

| # | Location | Issue | Severity | Notes |
| --- | --- | --- | --- | --- |
| 10.1 | `app/(customer)/`, `app/(partner)/` | **No `error.tsx` and no `loading.tsx`** in either group | MEDIUM | An unhandled throw in a partner job page shows the raw Next error boundary to an external print-company rep. The `(app)` and `(portal)` groups both have these. |
| 10.2 | repo root | **No `app/global-error.tsx`** | LOW | An error thrown in the root layout has no branded fallback. |
| 10.3 | public routes | No `error.tsx` at the public-route level | MEDIUM | Every gallery reads Supabase Storage per request with `force-dynamic`. A Storage outage renders the framework default error to a public visitor. `lib/data.ts:609` logs and returns `[]` for *listing* failures, which covers the common case — but not a throw elsewhere in the render. |
| 10.4 | `app/mafiaterpz/page.tsx` | **[CONFIRMED via docs]** `CLAUDE.md` states the `MAFIA terpz` bucket **does not exist in Supabase yet**, so the page renders its empty state permanently | LOW | Intentional; graceful. Worth confirming whether the bucket was since created. |
| 10.5 | `app/api/clients/route.ts` | No internal caller found anywhere in `app/`, `components/`, `lib/`, or `mobile/` | LOW | Uses `auth: "secret"` (apikey header) so it is not publicly reachable. **[INFERENCE]** likely an external-integration endpoint or a leftover reference implementation. Needs owner confirmation before any action. |
| 10.6 | 115 `console.error` sites | Errors are logged but never reported | MEDIUM | See Phase 18. Not a bug per se; a blind spot. |

### Race conditions and async handling

Spot-checked the highest-risk paths. **No missing `await`, no unhandled promise, no obvious race** found in:
- `approvePortalAccessAction` — handles `23505` by **constraint name** (`ONE_PER_USER` vs `ONE_PER_CLIENT`), which is the correct way to tell an idempotent re-approval from a genuine collision.
- Partner job-number assignment — `UPDATE … RETURNING` takes a row lock, with `job_number UNIQUE` as second defence.
- Upload orphan cleanup — `updatePartnerJobAction` collects Storage keys **before** the RPC (while rows are still readable) and deletes after, which is the correct ordering.

---

## Phase 11 — Images & assets

`public/` holds **26 files, 4.6 MB total**.

### Asset Optimization Opportunities

| Asset | Size | Finding | Recommendation |
| --- | --- | --- | --- |
| `public/zazalogo.png` | **1.2 MB** | **[CONFIRMED]** Largest asset in the repo by 35%. A single-brand logo for the partner portal. | Convert to WebP/AVIF and resize to actual display size. **[INFERENCE]** likely a 50–100× reduction. Highest-value single asset fix. |
| `public/taste-budz-logo.png` | **888 KB** | Rendered at `max-w-xs sm:max-w-sm` (~320–384px) *and* used as the OG image | Serve two derivatives: a ~400px WebP for the page, a 1200×630 JPG for OG |
| `public/home-mobile-bg.jpg` | **504 KB** | Full-bleed `fixed` mobile background, loaded on **every** phone visit to `/` | Re-encode as WebP at the real viewport ceiling; **[INFERENCE]** ~150–200 KB achievable |
| `public/mafia-terpz-logo.png` | **380 KB** | Same pattern as taste-budz | Same fix |
| `public/logo.png` | 188 KB | **15 references** — the most-used asset in the repo | Highest leverage per byte saved; convert to WebP |
| `public/premade-watermark.png` | 168 KB | Deliberately pre-sized to 800px and rendered `unoptimized` on **every** gallery card | Documented decision. **[INFERENCE]** a WebP at the same 800px would cut it substantially with no behavior change |
| `public/next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg` | 4 KB each | **[CONFIRMED] 0 references each** — Next.js starter leftovers | Delete (see Phase 7) |
| `public/mylar/index.html` | **290 KB** | Fully inlined single-file site (all CSS/JS/images inline) | See Phase 12 |
| `public/.DS_Store`, `public/assets/.DS_Store` | 8 KB | macOS artifacts present on disk | **Not tracked in git** (`git ls-files` returns none) — `.gitignore` covers `.DS_Store`. Local-only noise; safe to delete |
| `8pc-template.pdf` (repo root) | **28 MB** | Reference artifact for the slot grid | **Correctly gitignored** and never read at runtime. No action. |

### Delivery efficiency

**[CONFIRMED]** The project uses plain `<img>` **everywhere** — 24 tags across 17 files, each with an `eslint-disable @next/next/no-img-element` and a documented reason. `CLAUDE.md` states Vercel's Image Optimization endpoint returns `OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` in production, so `next/image` is off the table.

This makes **source-file optimization the only lever available** — there is no runtime resizing to fall back on. That elevates the logo findings above from housekeeping to the primary image-performance work.

Two mitigations are already in place and working well:
- Partner job thumbnails use **Supabase Storage's own `transform` option** (640px WebP, ~55–65 KB from 4.3 MB sources) via `/api/partner-job-files/[fileId]?thumb=1` — a genuinely elegant answer.
- `/whiteash` serves pre-rendered WebP at exactly two display sizes from an out-of-repo pipeline.

**[INFERENCE]** The Supabase `transform` trick used for partner thumbnails could be extended to the public galleries (`/portfolio`, `/taste-budz`, `/gso`, `/mafiaterpz`), which currently serve full-resolution bucket originals through plain `<img>`. That is likely the single largest available performance win on public pages.

### Bucket-backed images

`/portfolio`, `/taste-budz`, `/gso`, `/mafiaterpz`, `/premadedesigns`, `/whiteash` all render Storage contents. **No broken asset references were found** — every path is constructed from a listing at request time rather than hardcoded, so a deleted object degrades to a missing image rather than a build failure.

---

## Phase 12 — Performance

### CRITICAL

*None found.* No blocking synchronous work, no unbounded query, no N+1 in a hot path.

### HIGH

| # | Finding | Evidence | Recommendation |
| --- | --- | --- | --- |
| 12.1 | **Full-resolution bucket originals on public galleries** | `/portfolio`, `/taste-budz`, `/gso`, `/mafiaterpz` render `getPublicUrl()` results directly in `<img>` with no transform | Apply the Supabase `transform` pattern already proven in `/api/partner-job-files/[fileId]?thumb=1`. **[INFERENCE]** likely the largest public-page win available |
| 12.2 | **1.2 MB + 888 KB + 504 KB + 380 KB of unoptimized PNG/JPG** | Phase 11 | Re-encode. With `next/image` unavailable, this is the only lever |
| 12.3 | **Every data-backed route is `force-dynamic`** | All four group layouts set it | **Correct and necessary** for RLS-scoped per-user data. But it also applies to the **public galleries**, whose content is identical for every visitor. `/whiteash` already shows the better pattern (`revalidate: 300` on a manifest fetch — visible in the build output as `5m / 1y`). **[INFERENCE]** the other galleries could use ISR and stop hitting Storage on every request |

### MEDIUM

| # | Finding | Evidence | Recommendation |
| --- | --- | --- | --- |
| 12.4 | **48% of `.tsx` files are Client Components** (91/190) | grep | Largely justified (canvas tools, wizards, uploaders, drag-drop). **[INFERENCE]** worth auditing the admin `(app)` pages specifically, where server rendering is more often viable |
| 12.5 | **Two icon libraries in the bundle graph** | lucide 64 + phosphor 48 | Both tree-shake per-icon, so cost is bounded — but a route importing from both pays twice. Consolidation is a large mechanical change |
| 12.6 | **`public/mylar/index.html` is 290 KB** with a render-blocking Google Fonts stylesheet | `<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:…&family=Space+Mono:…">` | Three font families with 7 weights on one page. **[INFERENCE]** Self-host or reduce to the weights actually used. Note this file is currently unlinked (Phase 5) |
| 12.7 | **`lib/types/database.ts` is 1324 lines** imported broadly | file size | Types are erased at build, so **no runtime cost**; it is a TS-server responsiveness issue only. Low priority |

### LOW

| # | Finding | Recommendation |
| --- | --- | --- |
| 12.8 | Six components exceed 500 lines | Code-splitting opportunity; `mockup-sheet-generator.tsx` already uses `next/dynamic` for Konva, which is the right pattern to extend |
| 12.9 | `/premadedesigns` holds a 2,312-image manifest client-side | Already paginated (24 covers / 36 designs) with a 60s cache and only-visible-page signing — **well handled**, noted for completeness |

### Performance work already done well (do not undo)

The partner jobs grid is a model of restraint and is worth reading before optimizing anything else: server-enforced `PREVIEWS_PER_JOB` cap, `IntersectionObserver`-gated image insertion, slideshow timers that run only while visible, `private, max-age=1800` on the redirect, and the `THUMB_SIGNED_SECONDS > THUMB_CACHE_SECONDS` invariant. Browser-side ZIP (`jszip`) keeps file bytes out of Vercel functions entirely.

---

## Phase 13 — SEO

**This is the weakest area of the codebase**, and the gap is structural rather than a set of small misses.

### CRITICAL findings

| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| 13.1 | **No sitemap at all** | **[CONFIRMED]** No `app/sitemap.ts`, no `public/sitemap.xml`; a repo-wide search for `sitemap*` returns nothing | ~20 public routes, **11 of which have zero inbound internal links**. With no sitemap and no links, those pages are effectively undiscoverable by crawlers. This is the highest-impact SEO finding. |
| 13.2 | **No `robots.txt`** | **[CONFIRMED]** no `app/robots.ts`, no `public/robots.txt` | No crawl directives, and no place to point at a sitemap. Also means the superseded `/mylar-bag-printing` and `/how-to-order` compete with the current `/mylar-printing` |
| 13.3 | **The homepage description describes an invoicing tool** | `app/page.tsx:7` is `export const metadata = { title: "TD Studios" }` — **no description, no openGraph, no twitter**. It therefore inherits `app/layout.tsx:39`: *"TD Studios invoicing — manage clients, create invoices, and track payments."* | The brand's main public landing page — a design-studio link-in-bio — presents itself to search and social as B2B invoicing software. Directly undercuts every public page, since they all inherit this default. |

### HIGH findings

| # | Finding | Evidence |
| --- | --- | --- |
| 13.4 | **No canonical URLs anywhere** | **[CONFIRMED]** zero `alternates.canonical` in the repo. Most acute for the partner portal, which by design serves identical content at **three** URLs (subdomain, `/zaza-orders/…`, `/partner/zaza/…`). Mitigated in practice because that content is auth-gated — but the pattern is unguarded for any future public multi-address route |
| 13.5 | **Only one page sets robots directives** | `app/whiteash/page.tsx:13` (`index: false, follow: false`) is the sole `robots` usage. Superseded pages and gated galleries carry no `noindex` |
| 13.6 | **No structured data** | No JSON-LD anywhere. For a design studio with a services surface, `Organization` + `Service` schema is standard and absent |

### MEDIUM findings

| # | Finding | Evidence |
| --- | --- | --- |
| 13.7 | **Metadata quality is inconsistent across sibling galleries** | `/taste-budz`, `/designs`, `/mafiaterpz` each define full `openGraph` + `twitter` blocks; **`/gso` defines only `title` + `description`** — a direct consequence of the copy-paste duplication in Phase 6 |
| 13.8 | **Admin/portal routes have full metadata but no `noindex`** | Every `(app)` and `(portal)` page exports `metadata`. They are auth-gated so crawlers get redirected, but explicit `noindex` on those layouts costs one line and removes all doubt |

### What is done well

- **Metadata coverage is genuinely excellent**: 60 of 66 route files export `metadata` or `generateMetadata`. The 6 without are correct omissions (redirect-only routes and layouts).
- `metadataBase` is set properly with a three-tier fallback (`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → localhost) at `app/layout.tsx:9-14`.
- A title `template` (`"%s · TD Studios"`) is configured.
- OG and Twitter images exist at the root (`app/opengraph-image.png`, `app/twitter-image.png`) and are picked up in the build.
- **Heading hierarchy is correct.** Gallery pages that use a logo image as the visual header pair it with a visually-hidden `<h1 className="sr-only">` (`app/taste-budz/page.tsx:61`, `app/mafiaterpz/page.tsx:67`) — exactly right. No duplicate or missing `<h1>` was found.
- All `<img>` tags carry `alt` (Phase 14).

---

## Phase 14 — Accessibility

### Confirmed clean

| Check | Result |
| --- | --- |
| `<img>` without `alt` | **0 of 24** — verified by parsing every `<img …>` tag body, not line-matching. The 5 apparent misses are the literal string `<img` inside explanatory **comments** |
| Clickable `<div>` / `<span>` with `onClick` | **0** |
| `dangerouslySetInnerHTML` | **0** |
| `aria-*` attributes | **94 occurrences** |
| `sr-only` (visually-hidden text) | **18 occurrences** |
| `<html lang>` | set to `"en"` (`app/layout.tsx`) |
| Decorative images | correctly use `alt=""` (e.g. `components/partner-jobs/job-preview.tsx:129`, `new-job-form.tsx:187`) |

For a codebase of this size, **zero clickable divs and 100% alt coverage** is an unusually good result and reflects consistent use of shadcn primitives (which carry Radix's accessibility behavior) rather than hand-rolled controls.

### Confirmed issues

| # | Finding | Location | Severity |
| --- | --- | --- | --- |
| 14.1 | **`formatDetection: { telephone: false }`** is set globally at `app/layout.tsx:47`, while several admin pages render `tel:` links | `app/layout.tsx:47` vs `app/(app)/mylar-requests/[id]/page.tsx`, `design-requests/[id]/page.tsx` | LOW — the explicit `<a href="tel:">` still works; only auto-detection is suppressed. Intentional-looking |
| 14.2 | **`colorScheme: "dark"` is forced** and `<html>` hardcodes `className="dark"` with `style={{ colorScheme: "dark" }}` | `app/layout.tsx:54, 66-77` | LOW–MEDIUM — no light mode exists. Users who need a light or high-contrast rendering have no path. **[INFERENCE]** a deliberate brand decision, but worth naming |

### Requires manual / browser testing (cannot be determined from code)

| Area | Why code inspection is insufficient |
| --- | --- |
| **Color contrast** | The design leans heavily on `text-white/60`-style translucency over photographic and animated backgrounds. `CLAUDE.md` itself notes centred headers land where *"even pure white is ~1.1:1"* and introduces `.text-on-photo` with a two-layer text-shadow to compensate. **That is an acknowledged contrast problem with a mitigation** — whether the mitigation reaches WCAG AA needs a contrast checker on rendered pixels |
| **Keyboard navigation** | The 4-digit keypad (`app/taste-budz/keypad.tsx`), the mockup tools' drag-drop (`@dnd-kit` has good defaults but needs verification), the Konva canvas in `/tools/8pc-mockup-generator` (canvas content is inherently invisible to AT), and the lightbox focus trap in `app/portfolio/portfolio-lightbox.tsx` |
| **Screen-reader flow** | The homepage ticket card flips between three modes (`bio`/`signin`/`forgot`) **in place with no navigation** — whether focus moves and whether the change is announced needs an AT test |
| **Motion** | `prefers-reduced-motion` is honored on the homepage per `CLAUDE.md`; coverage across `AnimatedBackground` and framer-motion transitions elsewhere is unverified |

---

## Phase 15 — Security

> No secret values are reproduced in this report. Locations and exposure types only.

### Secret handling — clean

| Check | Result |
| --- | --- |
| Secrets committed to source | **None found.** A scan for JWT-shaped strings, `sb_secret`, `sk_live`, `sk_test` across `app/`, `lib/`, `components/`, `scripts/` returned nothing |
| `.env.local` present locally | Yes — **correctly gitignored** (`.gitignore` uses `.env*` with an `!.env.example` exception). Verified it is not tracked |
| `NEXT_PUBLIC_*` exposure | **Only 3 exist**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`. All three are **safe to expose by design** — the anon key is RLS-scoped and browser-intended. **No server secret is prefixed `NEXT_PUBLIC_`** |
| Service-role key usage | `SUPABASE_SECRET_KEY` appears in 4 places, all server-only modules |
| `MARTY_TEMP_PASSWORD` | Read only by `scripts/create-marty-client.ts`; deliberately absent from `.env.example`; never hardcoded |

### Injection and unsafe rendering — clean

| Check | Result |
| --- | --- |
| `dangerouslySetInnerHTML` | **0 occurrences** |
| `eval` / `new Function` | none found in application code |
| SQL injection | N/A — all access via Supabase client/RPC, no raw SQL string building in app code |
| **Open redirect** | **Properly guarded.** `app/auth/callback/route.ts:35-38` requires `target.startsWith("/") && !target.startsWith("//") && target !== "/login"`, else falls back to `roleHome()`. The `//` check correctly blocks protocol-relative URLs — a commonly missed case |
| `target="_blank"` without `rel` | **0** (Phase 4) |

### Confirmed findings

#### 15.1 — `/gso` bypasses the keypad gate that `/designs` applies to the same content — **[CONFIRMED]**, severity **MEDIUM**

```
app/designs/page.tsx:7,52   import { getGsoImages } … const images = await getGsoImages();
                            → gated by hasDesignsAccess() (code "0420")
app/gso/page.tsx:4,17       import { getGsoImages } … const images = await getGsoImages();
                            → NO GATE. Renders immediately.
```

Both routes are in `PUBLIC_PATHS`. `/gso` renders the **entire GSO bucket with no code required**, which makes the `/designs` keypad decorative for anyone who knows the second URL.

`CLAUDE.md` documents both routes and describes `/gso` as *"ungated, reached by URL only"* — so this may be a known and accepted state. **But the documentation presents them as two features rather than noting that one defeats the other**, which is why it is surfaced here. **This needs an owner decision, not an automatic fix**: either gate `/gso`, remove it, or accept that the GSO bucket is public and drop the `/designs` gate as theatre.

#### 15.2 — Keypad gates have no rate limiting — **[CONFIRMED]**, severity **MEDIUM**

`app/{taste-budz,designs,mafiaterpz,martyig}/access.ts` compare a **4-digit constant** (`"0420"` — the same code across all four) with `!==` and return `{ error: "Wrong code. Try again." }`. There is **no attempt counter, no delay, no lockout**.

- 10,000 combinations is trivially brute-forceable by script.
- The comparison is not timing-safe (**[INFERENCE]** low practical risk over a network for a 4-char compare, noted for completeness).
- **The project already knows this**: `app/premadedesigns/access.ts` (131 lines) throttles failed attempts and signs its cookie, and `app/(partner)/partner/[slug]/access.ts` (193 lines) throttles to *"8 per IP per 10 minutes because 4 digits is only 10,000 combinations."* The four simple gates never received that treatment.

**Mitigating context:** `CLAUDE.md` calls these *"a vibe lock for a semi-private gallery"* — the protected content is portfolio imagery, not personal data. The severity is about **honesty of the control**, not data breach. Fixing it is one function if Phase 9.2's consolidation happens first.

#### 15.3 — No security headers — **[CONFIRMED]**, severity **MEDIUM**

`next.config.ts` has **no `headers()` block**. Missing across the entire site:

| Header | Consequence of absence |
| --- | --- |
| `Content-Security-Policy` | No defence-in-depth against injected script. (Mitigated: zero `dangerouslySetInnerHTML`) |
| `Strict-Transport-Security` | No HSTS. (Mitigated: Vercel serves HTTPS by default) |
| `X-Frame-Options` / `frame-ancestors` | **The app can be framed** — clickjacking risk on authenticated admin/portal actions |
| `X-Content-Type-Options: nosniff` | MIME sniffing permitted on the file-download routes |
| `Referrer-Policy` | Full URLs leak to third parties. Notable given signed Storage URLs and `/q/<slug>` |
| `Permissions-Policy` | No restriction on camera/mic/geolocation |

`X-Frame-Options` is the most valuable of these here, given `/portal` and `/dashboard` carry destructive actions.

#### 15.4 — Three unauthenticated compute endpoints with no rate limiting — **[CONFIRMED]**, severity **MEDIUM**

`/api/cutline/generate`, `/api/mockup-sheet/generate`, `/api/bag-mockup-grid/generate` accept multipart uploads and run `sharp` + `pdf-lib` with **no auth and no rate limit**.

Well-defended on input: magic-byte sniffing (not MIME trust), per-file and per-request size caps, count caps, and a `MAX_OUTPUT_PIXELS` ceiling on the unbounded-rows grid. So this is **not** a memory-exhaustion vector.

It is a **cost and availability** vector: each call burns Vercel function CPU proportional to image size, and nothing stops scripted repetition. **[INFERENCE]** The project already owns the primitive to fix this — `checkBurst` / `submitterHash` in `lib/mylar-printing/abuse.ts`, reused by the design-request form. Applying it here would be consistent with existing patterns.

### Authorization model — strong

Verified and worth recording as **done right**:

- **Defence in depth is real, not claimed.** `proxy.ts` is explicitly documented as optimistic; enforcement is RLS + `requireX()` in every Server Component and Action.
- **`/api` is outside the proxy matcher and every route re-authenticates itself.**
- **Service-role usage is narrow and always behind `requireAdmin()`**, with a documented enumeration of every legitimate use.
- **`/api/partner-job-files/[fileId]` uses the client as the authorization mechanism** — a rep's request goes through the RLS-scoped client so the policy itself scopes the row; an admin's uses the service role. There is no second predicate in the route to drift out of step with the policy. This is a genuinely good design.
- **Storage objects are never served by raw URL** — always a 60-second signed URL behind an authorization check.
- **Privacy-preserving logging**: salted, truncated SHA-256 IP hashes for QR scans and submission rate limits; raw IPs are never stored.
- **Migration `20260829120000`** narrowed an audit-log fallback specifically to prevent a rep fabricating log entries, and deliberately made "not yours" and "does not exist" return **identical** errors to avoid an existence oracle. That is careful security thinking.

---

## Phase 16 — Configuration & environment

### Environment variables — documented and consistent

**[CONFIRMED]** All 13 env names read anywhere in the codebase are documented in both `.env.example` and `CLAUDE.md`'s table. **No undocumented variable and no documented-but-unused variable was found.**

| Variable | Reads | Guarded |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 8 | `isSupabaseConfigured()` |
| `NEXT_PUBLIC_SUPABASE_URL` | 6 | same |
| `NODE_ENV` | 6 | n/a |
| `VERCEL_URL` | 4 | fallback chain |
| `SUPABASE_URL` | 4 | `isSupabaseAdminConfigured()` |
| `SUPABASE_SECRET_KEY` | 4 | same |
| `NEXT_PUBLIC_SITE_URL` | 4 | fallback chain |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | 2 each | `isResendConfigured()` |
| `QR_SCAN_SALT` | 2 | built-in default |
| `MARTY_TEMP_PASSWORD` | 2 | script-only |
| `ADMIN_EMAILS` | 2 | **must be set or no admin access** |
| `PREMADE_GALLERY_COOKIE_SECRET` | 1 | falls back to `SUPABASE_SECRET_KEY` |

Two are documented in `.env.example` but did **not** appear in my `process.env.` scan: `ZAZA_PORTAL_EMAIL` / `ZAZA_PORTAL_PASSWORD`. **[INFERENCE]** they are almost certainly read via a destructured or computed access in `app/(partner)/partner/[slug]/access.ts` rather than a literal `process.env.NAME` — worth a one-line confirmation, not a finding.

**The graceful-degradation pattern is excellent**: every read/write is guarded, so a missing variable produces an empty state rather than a crash. The build succeeds with `.env.local` present; **[INFERENCE]** based on the guard pattern it should also succeed with no env at all.

### `next.config.ts` review

| Setting | Status |
| --- | --- |
| `turbopack.root: __dirname` | ✅ Correct — pins the workspace root against stray parent lockfiles |
| `serverActions.bodySizeLimit: "4mb"` | ✅ Deliberate; only the portal single-file upload uses it |
| `rewrites()` → `/mylar` → `/mylar/index.html` | ✅ Needed; `public/` doesn't resolve `index.html` |
| `redirects()` → `/qr-generator/designs` → `/premadedesigns` (permanent) | ✅ Preserves old shared links |
| `outputFileTracingIncludes` | ✅ 2 entries (invoice logo, cutline PDF), both required for `fs` reads in Vercel functions |
| `images.remotePatterns` | ✅ Correctly narrow — one host, `/storage/v1/object/sign/**` only |
| **`headers()`** | ❌ **absent** — see 15.3 |

### Deployment-specific risks

| # | Risk | Detail |
| --- | --- | --- |
| 16.1 | **New cutline presets silently 404 in production** | Any preset added to `lib/cutline/presets.ts` **must** also be added to `outputFileTracingIncludes`. `CLAUDE.md` warns about this, but nothing enforces it — a forgotten entry works locally and fails only on Vercel. **[INFERENCE]** a build-time assertion iterating `CUTLINE_PRESETS` and `fs.existsSync`-ing each would close this |
| 16.2 | **`ADMIN_EMAILS` and `workspace_admins` are two allowlists that must be kept in sync by hand** | `CLAUDE.md` states `npm run admin:sync` **does not exist yet**, and each new admin's uid must be added to `workspace_admins` manually via the service role. A missed step yields an admin who passes route checks but sees an empty workspace |
| 16.3 | **`company_settings` adoption `UPDATE` is unapplied** | See Phase 10 |
| 16.4 | **No `vercel.json` / `vercel.ts`** | Consequently no cron, which is why orphan-artwork cleanup is documented as a manual SQL task |
| 16.5 | **`shadcn` in `dependencies` while also being a build-time CSS source** | See Phase 8 — verify before moving |

### Tooling gaps

| Gap | Impact |
| --- | --- |
| **No CI workflow** (no `.github/workflows/`) | `lint` / `tsc` / `build` all pass — but nothing enforces that on a push or PR |
| **No Prettier config or format script** | Formatting is consistent in practice; nothing guarantees it |
| **No tests** | Zero automated coverage of totals math, RLS assumptions, or upload orchestration |
| `components.json` `aliases.hooks` → `@/hooks` | Directory does not exist |

---

## Phase 17 — Architecture diagram

```
                                    ┌──────────────────────────────────────┐
                                    │             VISITORS                 │
                                    ├──────────────────────────────────────┤
                                    │ public · admin · portal client       │
                                    │ customer · print-partner rep         │
                                    └───────────────────┬──────────────────┘
                                                        │
                      ┌─────────────────────────────────▼───────────────────────────────┐
                      │  proxy.ts   (Next 16 Middleware, Node.js runtime)                │
                      │  1. refresh Supabase session (cookies survive next/rewrite/302)  │
                      │  2. resolvePartnerRoute()  host/alias → /partner/<slug>/…        │
                      │  3. OPTIMISTIC auth redirect   ← NOT the security boundary       │
                      └───┬──────────────┬──────────────┬──────────────┬─────────────┬───┘
                          │              │              │              │             │
        ┌─────────────────▼──┐ ┌─────────▼────────┐ ┌───▼──────────┐ ┌─▼──────────┐ ┌▼──────────────┐
        │   PUBLIC ROUTES    │ │    app/(app)/    │ │ app/(portal)/│ │(customer)/ │ │  (partner)/   │
        │   (no session)     │ │  ADMIN · AppShell│ │ PortalShell  │ │  pending   │ │ PartnerShell  │
        │                    │ │  requireAdmin()  │ │requirePortal │ │requireCust │ │requirePartner │
        │ / (bio card)       │ │                  │ │   User()     │ │  omer()    │ │  Session()    │
        │ /portfolio         │ │ dashboard        │ │ portal       │ │ /account   │ │ /jobs         │
        │ /whiteash          │ │ clients          │ │ /files (DAM) │ │  /pending  │ │ /jobs/new     │
        │ /taste-budz  ⌨    │ │ invoices         │ │ /projects    │ │ /onboarding│ │ /jobs/[id]    │
        │ /designs     ⌨    │ │ client-portals   │ │ /invoices    │ │            │ │   /edit       │
        │ /gso  (UNGATED!)   │ │ qr · settings    │ │ /account     │ │            │ │ /login   ⌨   │
        │ /mafiaterpz  ⌨    │ │ mylar-requests   │ │              │ │            │ │               │
        │ /martyig     ⌨    │ │ design-requests  │ │              │ │            │ │ 3 addresses:  │
        │ /premadedesigns ⌨ │ │ partner-jobs     │ │              │ │            │ │ subdomain /   │
        │ /mylar-printing    │ │                  │ │              │ │            │ │ alias / path  │
        │ /custom-design-req │ │ ← nav-config.ts  │ │              │ │            │ │               │
        │ /tools/* (4 tools) │ └────────┬─────────┘ └──────┬───────┘ └─────┬──────┘ └──────┬────────┘
        │ /q/[slug] → 302    │          │                  │               │               │
        └─────────┬──────────┘          │                  │               │               │
                  │                     │                  │               │               │
                  └─────────────────────┴──────────┬───────┴───────────────┴───────────────┘
                                                   │
                    ┌──────────────────────────────▼─────────────────────────────────┐
                    │              COMPONENT LAYER                                    │
                    │  components/{clients,invoices,portal,qr,partner-jobs,           │
                    │              mylar-printing,design-requests,dashboard}          │
                    │  components/shared/  ·  components/layout/                      │
                    │  components/ui/  ← 13 shadcn primitives (radix-lyra)            │
                    └──────────────────────────────┬─────────────────────────────────┘
                                                   │
              ┌────────────────────────────────────┼────────────────────────────────────┐
              │                                    │                                    │
   ┌──────────▼───────────┐          ┌─────────────▼──────────────┐        ┌────────────▼───────────┐
   │  READS               │          │  WRITES                    │        │  ROUTE HANDLERS        │
   │  Server Components   │          │  app/actions/*  "use server"│        │  app/api/*             │
   │                      │          │  19 files                  │        │  (outside proxy —      │
   │  lib/data.ts (731L)  │          │                            │        │   self-authenticating) │
   │  lib/*/queries.ts    │          │  zod parse → authenticate  │        │                        │
   │  lib/format.ts       │          │  → mutate → revalidatePath │        │  files · pdf · artwork │
   │  lib/invoice.ts      │          │                            │        │  partner-job-files     │
   │  lib/dam.ts          │          │  partner writes ALSO emit  │        │  cutline · mockups     │
   │  lib/tasks.ts        │          │  recordPartnerJobEvent()   │        │  health · clients      │
   └──────────┬───────────┘          └─────────────┬──────────────┘        └────────────┬───────────┘
              │                                    │                                    │
              └────────────────┬───────────────────┴────────────────────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────────────────────────────┐
        │   THREE SUPABASE CLIENTS — never mixed                               │
        │  ┌────────────────────┬───────────────────────┬────────────────────┐ │
        │  │ lib/supabase/      │ lib/supabase/         │ lib/supabase/      │ │
        │  │   server.ts        │   with-supabase.ts    │   admin.ts         │ │
        │  │ SSR · RLS-scoped   │ route handlers        │ SERVICE ROLE       │ │
        │  │ anon key + cookies │ publishable/secret    │ ** BYPASSES RLS ** │ │
        │  │ ← the default      │ ← app/api/ only       │ ← narrow, always   │ │
        │  │                    │                       │   behind requireAdmin│
        │  └────────────────────┴───────────────────────┴────────────────────┘ │
        └──────────────────────┬───────────────────────────────────────────────┘
                               │
   ┌───────────────────────────▼────────────────────────────────────────────────────────┐
   │                          SUPABASE  (the real security boundary)                     │
   │                                                                                     │
   │  POSTGRES — RLS on every table, three scoping shapes:                               │
   │    owner-scoped  → current_owner_id()   (clients, invoices, qr, tasks, portal, …)   │
   │    partner-scoped→ partner_company_id() (5 design_job* / partner_* tables)           │
   │    NO POLICIES   → service role only    (mylar_*, custom_design_*, workspace_*)      │
   │  Triggers: invoice totals · TD-INV-#### seq · ZA-#### per-company · column guards    │
   │  38 migrations                                                                       │
   │                                                                                      │
   │  STORAGE (buckets)                                                                   │
   │    private: client-files · partner-job-files · mylar-artwork · design-requests ·     │
   │             premade-designs            → 60s signed URLs only, never raw             │
   │    public:  custom-work · GSO · TASTE BUDZ · MAFIA terpz · white-ash-august          │
   │                                                                                      │
   │  AUTH: email/password + Google OAuth (PKCE) → app/auth/callback/route.ts             │
   └──────────────────────────────────────┬──────────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┼──────────────────────────────────┐
        │                                 │                                  │
   ┌────▼─────────────┐   ┌───────────────▼──────────────┐   ┌───────────────▼──────────┐
   │  RESEND          │   │  lib/notifications/          │   │  VERCEL                  │
   │  invoice email   │◄──┤  dispatch.ts → channels/     │   │  hosting · functions     │
   │  portal invites  │   │  email.ts  (sms.ts = TODO)   │   │  NO cron (no vercel.json)│
   │                  │   │  ← fed by partner_job_events │   │  Image Optimization      │
   └──────────────────┘   └──────────────────────────────┘   │   UNAVAILABLE (402)      │
                                                              └──────────────────────────┘

   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │  ZERO-PERSISTENCE SIDE-ARCHITECTURE — the 4 public print tools                    │
   │  browser → multipart POST → sharp + pdf-lib in memory → stream file back          │
   │  no auth · no Supabase · nothing stored · limits mirrored client+server           │
   │  ZIP bundling happens in the BROWSER (jszip), never server-side                   │
   └──────────────────────────────────────────────────────────────────────────────────┘

   ⌨ = 4-digit keypad gate (shared passcode, NOT account auth)
```

---

## Phase 18 — Prioritized report

## EXECUTIVE SUMMARY

**This is a well-built, actively maintained codebase — materially above average for a solo-maintained production application.** The evidence is direct: typecheck, lint, and production build all pass with zero errors and zero warnings; there is not a single `any` type, `@ts-ignore`, `dangerouslySetInnerHTML`, clickable `<div>`, `href="#"`, or stray `console.log` in application code; every `<img>` has an `alt`; every `target="_blank"` has a `rel`; the open-redirect guard correctly handles protocol-relative URLs. Authorization is genuinely defence-in-depth — the proxy is explicitly documented as optimistic and the real boundary is Postgres RLS, re-asserted in every Server Component and Action.

The codebase's most unusual asset is its **documentation**. `CLAUDE.md` records not just what the architecture is but which decisions were made the other way first and why they were reversed. During this audit, roughly a dozen things that looked like problems turned out to be documented, deliberate choices — orphan routes kept reachable so old links don't 404, plain `<img>` because Vercel's optimizer returns a payment error, two icon libraries split by area. **Any future contributor should read that file before changing anything**, and this audit is far more useful because it existed.

The weaknesses are concentrated and mostly structural rather than sloppy:

1. **SEO is the clear weak point.** No sitemap, no `robots.txt`, no canonicals, no structured data — and the public homepage of a design studio currently inherits the meta description *"TD Studios invoicing — manage clients, create invoices, and track payments."* Eleven public routes have zero inbound links, so with no sitemap they are effectively invisible.
2. **There are no tests and no CI.** Everything passes today, but nothing enforces that tomorrow. Invoice totals are computed in two places that must agree (browser + Postgres triggers) with no test asserting they do.
3. **Nothing reports errors.** 115 `console.error` calls land in Vercel logs unaggregated and unalerted; the only TODO in the repo says exactly this.
4. **A small amount of real duplication has security weight** — four copy-pasted keypad gates, none rate-limited, while two *other* gates in the same repo are properly throttled.

None of these is an emergency. All are tractable.

### Scores

| Dimension | Score | Reasoning |
| --- | --- | --- |
| **Architecture** | **9/10** | Clean four-audience separation via route groups; three Supabase clients with a documented never-mix rule; RLS-first with three deliberate scoping shapes; a channel-agnostic notification seam; a genuinely elegant zero-persistence sub-architecture for the print tools. Loses a point only for a few god-files and `lib/data.ts` not yet split the way newer features are. |
| **Maintainability** | **8/10** | Exceptional documentation; consistent `ActionState` shape across ~20 forms; domain logic properly extracted to pure `lib/` modules. Held back by six components over 500 lines (one at 1028), four copy-pasted gates, four copy-pasted gallery pages, and a hand-maintained 1324-line schema mirror that must be updated in lockstep with SQL. |
| **Code Quality** | **9/10** | Zero `any`, zero `@ts-ignore`, zero unhandled lint warnings, zero debug code, one TODO. Every `eslint-disable` carries a written justification. Async handling in the highest-risk paths (portal approval, job numbering, orphan cleanup) is correct and deliberate. |
| **Performance** | **7/10** | Thoughtful where it counts — Storage-transform thumbnails, `IntersectionObserver` gating, visibility-scoped timers, browser-side ZIP to keep bytes out of functions, correct pagination on a 2,312-image gallery. Dragged down by 3 MB of unoptimized PNG/JPG with **no `next/image` fallback available**, `force-dynamic` on public galleries whose content is identical for all visitors, and 48% client components. |
| **SEO** | **4/10** | The one genuinely weak dimension. No sitemap, no robots.txt, no canonicals, no JSON-LD; the brand homepage describes invoicing software; 11 orphan public routes; superseded pages competing with current ones. Partly offset by excellent per-page metadata coverage (60/66 files) and correct `sr-only` `<h1>` usage. |
| **Accessibility** | **8/10** | Strong confirmed baseline: 100% alt coverage, zero clickable divs, 94 aria attributes, 18 `sr-only`, correct heading hierarchy, Radix primitives throughout. Capped at 8 because contrast is a known concern the code itself acknowledges (`.text-on-photo` exists because white hits ~1.1:1 on photo backdrops), the site is dark-mode-only with no light or high-contrast path, and keyboard/AT behavior on the keypad, canvas tools, and the in-place card flip is unverified. |
| **Security** | **8/10** | RLS-first with the proxy correctly demoted to optimistic; no secrets in source; only three `NEXT_PUBLIC_` vars, all safe; narrow service-role surface always behind `requireAdmin()`; signed 60s URLs with no raw object exposure; privacy-preserving IP hashing; a migration written specifically to prevent audit-log forgery *and* to avoid an existence oracle. Loses points for absent security headers, four unthrottled keypads, `/gso` bypassing `/designs`' gate on identical content, and three unauthenticated compute endpoints with no rate limit. |
| **Developer Experience** | **8/10** | Best-in-class onboarding docs; four clean commands that all pass; graceful degradation means the app runs with no env vars. Held back hard by **no tests, no CI, no error monitoring, and no formatter** — plus two manual sync steps (`ADMIN_EMAILS` ↔ `workspace_admins`, cutline presets ↔ `outputFileTracingIncludes`) that fail silently or only in production. |

### **Overall: 7.6 / 10**

---

## TOP 10 PROBLEMS

### 1. No sitemap and no robots.txt
- **Severity:** HIGH
- **Location:** absent — no `app/sitemap.ts`, no `app/robots.ts`, no `public/robots.txt`
- **Problem:** ~20 public routes, **11 with zero inbound internal links**. Nothing tells a crawler they exist.
- **Impact:** Galleries, tools, and request forms are effectively undiscoverable through search. Superseded pages (`/mylar-bag-printing`, `/how-to-order`) can outrank the current `/mylar-printing`.
- **Fix:** Add `app/sitemap.ts` enumerating public routes (excluding gated/noindex ones) and `app/robots.ts` pointing at it. Add `noindex` to superseded pages.
- **Effort:** **SMALL**

### 2. The public homepage describes invoicing software
- **Severity:** HIGH
- **Location:** `app/page.tsx:7` (`metadata = { title: "TD Studios" }`) inheriting `app/layout.tsx:39`
- **Problem:** No `description`, `openGraph`, or `twitter` on the homepage, so it inherits *"TD Studios invoicing — manage clients, create invoices, and track payments."*
- **Impact:** Every search result and social share for the brand's main landing page — a design-studio link-in-bio — presents it as B2B invoicing. Every public page inheriting the default has the same problem.
- **Fix:** Give `app/page.tsx` its own full metadata block; retarget the root default at the public brand and let admin routes override.
- **Effort:** **SMALL**

### 3. No tests and no CI
- **Severity:** HIGH
- **Location:** repo-wide; no test runner, no `.github/workflows/`
- **Problem:** Zero automated coverage. Nothing enforces that `lint`/`tsc`/`build` keep passing.
- **Impact:** Highest-risk uncovered logic: `calculateTotals()` in `lib/invoice.ts` must agree with the Postgres triggers — `CLAUDE.md` warns "changing the formula means changing both", and nothing verifies it. Also uncovered: the `23505` constraint-name branching in portal approval, and the upload/orphan-cleanup ordering.
- **Fix:** A GitHub Actions workflow running the three existing commands is the 80% win. Then add unit tests for `lib/invoice.ts`, `lib/mylar-printing/types.ts` allocation math, and `lib/partner-jobs/types.ts` sorting/partitioning — all pure functions, all trivially testable.
- **Effort:** **MEDIUM**

### 4. No error monitoring anywhere
- **Severity:** HIGH
- **Location:** `app/(app)/error.tsx:17` (`// TODO(observability)`), plus 115 `console.error` sites
- **Problem:** Errors are logged to Vercel function logs with no aggregation, alerting, or ownership.
- **Impact:** A production failure in an invoice send, a partner upload, or a payment-adjacent action is invisible until a human reports it. Compounded by there being no tests.
- **Fix:** Wire Sentry (or Vercel's own error tracking) into the two existing `error.tsx` boundaries plus a `global-error.tsx`.
- **Effort:** **SMALL–MEDIUM**

### 5. `/gso` bypasses the keypad gate `/designs` applies to identical content
- **Severity:** MEDIUM–HIGH
- **Location:** `app/gso/page.tsx:17` vs `app/designs/page.tsx:52` — both call `getGsoImages()`
- **Problem:** `/designs` requires code `0420`; `/gso` renders the same bucket with no gate. Both are in `PUBLIC_PATHS`.
- **Impact:** The `/designs` gate is decorative for anyone who knows the second URL.
- **Fix:** **Owner decision required** — gate `/gso`, remove it, or accept the bucket as public and drop `/designs`' gate rather than leaving a control that doesn't control anything.
- **Effort:** **SMALL** (once decided)

### 6. Four keypad gates with no rate limiting
- **Severity:** MEDIUM
- **Location:** `app/{taste-budz,designs,mafiaterpz,martyig}/access.ts`
- **Problem:** 4-digit constant, plain `!==`, no attempt counter, no lockout — 10,000 combinations, brute-forceable by script. The same repo's `/premadedesigns` and partner gates **are** throttled ("8 per IP per 10 minutes because 4 digits is only 10,000 combinations").
- **Impact:** Bounded — the content is portfolio imagery, not personal data. The issue is a control that doesn't do what it appears to.
- **Fix:** Consolidate into `createKeypadGate()` (problem 7), then add throttling once.
- **Effort:** **SMALL** (after consolidation)

### 7. Copy-paste duplication across gates, galleries, and a security helper
- **Severity:** MEDIUM
- **Location:** 4× `access.ts` (byte-identical but for 3 constants); 4× gallery `page.tsx` (~85% identical); 3× `sniffImageMagic()` in `lib/{cutline,mockup-generator,bag-mockup-grid}/limits.ts`
- **Problem:** ~430 lines of near-identical code, including a **magic-byte security control implemented three times** on three unauthenticated endpoints.
- **Impact:** Every fix must be applied N times; a miss is silent. Already visible as drift — `/gso` lacks the `openGraph` block its three siblings have.
- **Fix:** `lib/keypad-gate.ts`, a `GatedGallery` component, `lib/image-magic.ts`.
- **Effort:** **MEDIUM**

### 8. No security headers
- **Severity:** MEDIUM
- **Location:** `next.config.ts` — no `headers()` block
- **Problem:** No CSP, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, or `Permissions-Policy`.
- **Impact:** `X-Frame-Options` matters most — `/dashboard` and `/portal` carry destructive actions and are currently frameable. `Referrer-Policy` matters given signed Storage URLs.
- **Fix:** Add a `headers()` block. Start with `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; add CSP later since it needs testing against Google Fonts and Supabase.
- **Effort:** **SMALL** (headers) / **MEDIUM** (CSP)

### 9. 3 MB of unoptimized images with no `next/image` fallback
- **Severity:** MEDIUM
- **Location:** `public/zazalogo.png` (1.2 MB), `taste-budz-logo.png` (888 KB), `home-mobile-bg.jpg` (504 KB), `mafia-terpz-logo.png` (380 KB), `logo.png` (188 KB, 15 refs)
- **Problem:** Logos an order of magnitude larger than their display size. Because Vercel's optimizer is unavailable (402), **there is no runtime resizing to compensate**.
- **Impact:** `home-mobile-bg.jpg` loads on every mobile visit to `/`; `logo.png` appears on 15 surfaces.
- **Fix:** Re-encode to WebP at real display dimensions; keep a 1200×630 JPG for OG. Separately, extend the Storage `transform` trick already used for partner thumbnails to the public galleries.
- **Effort:** **SMALL** (static files) / **MEDIUM** (gallery transforms)

### 10. Missing error and loading boundaries in two route groups
- **Severity:** MEDIUM
- **Location:** `app/(customer)/` and `app/(partner)/` have neither `error.tsx` nor `loading.tsx`; no `app/global-error.tsx`; no public-route error boundary
- **Problem:** `(app)` and `(portal)` have both; the other two groups have neither.
- **Impact:** An unhandled throw in a partner job page shows a raw framework error to an **external print-company rep** — the least forgiving audience the app has.
- **Fix:** Copy the existing `(app)` boundaries into `(customer)` and `(partner)`; add `global-error.tsx`.
- **Effort:** **SMALL**

---

## QUICK WINS

Ranked by benefit-to-effort. Everything here is low risk.

| # | Win | Benefit | Effort | Risk |
| --- | --- | --- | --- | --- |
| 1 | **Add `app/sitemap.ts` + `app/robots.ts`** | Makes ~20 public pages discoverable; single largest SEO lever | ~30 min | None |
| 2 | **Give `app/page.tsx` real metadata** | Fixes the brand's search + social presentation | ~15 min | None |
| 3 | **Re-encode the 5 large images to WebP** | ~2.5 MB saved on the only lever available (no `next/image`) | ~30 min | None — swap files, keep names |
| 4 | **Add a `headers()` block** (frame-options, nosniff, referrer-policy) | Closes clickjacking + referrer leakage | ~15 min | None (defer CSP) |
| 5 | **Add a CI workflow running `lint` + `tsc` + `build`** | Locks in a currently-perfect state | ~20 min | None |
| 6 | **Copy `error.tsx`/`loading.tsx` into `(customer)` + `(partner)`; add `global-error.tsx`** | No raw error screens for external reps | ~20 min | None |
| 7 | **Delete the 5 unused starter SVGs** | Removes confirmed dead assets | ~2 min | None (0 references verified) |
| 8 | **Uninstall `react-hook-form` + `@hookform/resolvers`** | Removes 2 confirmed-unused deps + transitives | ~5 min | None (0 imports verified) |
| 9 | **Add `noindex` to superseded pages** (`/mylar-bag-printing`, `/how-to-order`) | Stops them competing with `/mylar-printing` | ~5 min | None — routes stay reachable |
| 10 | **Wire Sentry into the existing `error.tsx` boundaries** | Closes the repo's only TODO; makes prod failures visible | ~1 hr | Low |
| 11 | **Extract `.glass-panel` into `app/globals.css`** | Removes 8 copy-pasted class strings; matches existing pattern | ~15 min | None |
| 12 | **Fix the stale comment at `lib/partner-jobs/types.ts:353` + `README.md:646`** | Prevents acting on an obsolete design note | ~5 min | None |
| 13 | **Apply the `company_settings` adoption `UPDATE`** | Fixes a known live bug making `/settings` unusable | ~5 min | Low — verify against prod first |
| 14 | **Remove the dead `hooks` alias in `components.json`** | Removes a pointer to a nonexistent directory | ~2 min | None |

---

## REFACTORING ROADMAP

### PHASE 1 — Fix bugs / broken behavior
1. Apply the `company_settings` `owner_id` adoption `UPDATE` from migration `20260824193000`'s trailing comment — `/settings` currently reads empty and double-inserts.
2. Add `error.tsx` + `loading.tsx` to `app/(customer)/` and `app/(partner)/`; add `app/global-error.tsx`; add an error boundary covering public routes.
3. Decide and act on `/gso` vs `/designs` (gate, remove, or accept — but don't leave a non-functioning control).
4. Confirm whether the `MAFIA terpz` bucket now exists; `/mylar-bag-printing` and `/how-to-order` still post to Formspree and create **no order record** — confirm that is still acceptable.
5. Correct the stale `job.done_changed` comments in `lib/partner-jobs/types.ts:353` and `README.md:646`.

### PHASE 2 — Remove confirmed dead code
1. Delete `public/{next,vercel,globe,window,file}.svg` (0 references each).
2. Remove `components/ui/dropdown-menu.tsx` (0 references) — or document why it is retained.
3. Uninstall `react-hook-form` and `@hookform/resolvers` (0 imports).
4. Remove the `hooks` alias from `components.json`, or create the directory.
5. Delete local `.DS_Store` files (already gitignored).
6. **Leave alone:** `partner_done_at`, the `cutline-files` bucket, and the `job.done_changed` type — all deliberately retained with documented reasons.

### PHASE 3 — Consolidate duplication
1. `lib/keypad-gate.ts` — `createKeypadGate({ cookieName, path, code })`, collapsing four `access.ts` files. **Do this before Phase 8's throttling work.**
2. `lib/image-magic.ts` — one `sniffImageMagic()` replacing three, with per-tool allowlists as data. **Security-relevant; prioritize within this phase.**
3. `GatedGallery` component or `createGalleryPage(config)` — collapses four gallery pages and fixes `/gso`'s missing `openGraph` block as a side effect.
4. `.glass-panel` / `.glass-panel-centered` in `app/globals.css`.

### PHASE 4 — Improve architecture
1. Decompose `components/partner-jobs/new-job-form.tsx` (1028 lines) into `useJobItems()`, `useJobUploads()`, and `JobItemCard`.
2. Split `lib/data.ts` (731 lines) into `lib/galleries.ts` + `lib/invoices/queries.ts`, following the pattern newer features already use.
3. Decompose `components/portal/file-browser.tsx` (833 lines) — view logic only; `lib/dam.ts` already holds the domain helpers.
4. Extract `BIO_LINKS` and `SocialRow` out of `app/home-card.tsx` (794 lines).
5. Add a build-time assertion that every `CUTLINE_PRESETS` entry exists in `outputFileTracingIncludes` — closes a failure mode that only manifests in production.
6. Write the `npm run admin:sync` script that `CLAUDE.md` and `OWNER_RESOLVE_ERROR` both already reference.
7. Add tests: start with the pure functions — `lib/invoice.ts` `calculateTotals()` (must match the Postgres triggers), `lib/mylar-printing/types.ts` allocation math, `lib/partner-jobs/types.ts` sorting/partitioning.

### PHASE 5 — Performance optimization
1. Re-encode the 5 large public images to WebP at real display sizes.
2. Extend the Supabase Storage `transform` pattern (already proven at `/api/partner-job-files/[fileId]?thumb=1`) to `/portfolio`, `/taste-budz`, `/gso`, `/mafiaterpz`.
3. Replace `force-dynamic` with ISR on the public galleries, following `/whiteash`'s `revalidate: 300` model.
4. Audit the admin `(app)` pages for Client Components that could be Server Components.
5. Reduce `public/mylar/index.html`'s three Google Font families / 7 weights, or self-host — **only if that page is going live**.
6. Extend `next/dynamic` code-splitting (already used for Konva) to the other 500+ line client components.

### PHASE 6 — SEO improvements
1. `app/sitemap.ts` — public routes only, excluding gated and `noindex` pages.
2. `app/robots.ts` — directives + sitemap pointer.
3. Full metadata on `app/page.tsx`; retarget the root default at the public brand.
4. `noindex` on superseded pages (`/mylar-bag-printing`, `/how-to-order`) and on the `(app)` / `(portal)` layouts.
5. `alternates.canonical` where a page is reachable at more than one URL — the partner portal's three addresses especially.
6. JSON-LD `Organization` + `Service` schema on the homepage and public service pages.
7. Normalize metadata across the four gallery pages (falls out of Phase 3.3 automatically).

### PHASE 7 — Accessibility improvements
1. **Run a real contrast audit** on `.text-on-photo` and `.on-glass` surfaces — the code already acknowledges white hits ~1.1:1 on photo backdrops.
2. Keyboard-test the keypad, the `@dnd-kit` grid, the Konva canvas, and the portfolio lightbox focus trap.
3. Screen-reader test the homepage card's three-mode in-place flip — verify focus moves and the change is announced.
4. Provide a text alternative or export path for the Konva canvas in `/tools/8pc-mockup-generator` (canvas content is invisible to AT).
5. Verify `prefers-reduced-motion` coverage beyond the homepage.
6. Consider whether dark-only is a permanent decision, given no high-contrast path exists.

### PHASE 8 — Security hardening
1. `headers()` in `next.config.ts` — `X-Frame-Options`, `nosniff`, `Referrer-Policy` first; CSP after testing against Google Fonts + Supabase.
2. Add throttling to the consolidated keypad gate (Phase 3.1) — reuse the existing `/premadedesigns` and partner-portal approach.
3. Rate-limit the three unauthenticated generator endpoints using `checkBurst` / `submitterHash` from `lib/mylar-printing/abuse.ts`, already proven on two other public forms.
4. Resolve the `/gso` gate bypass (also Phase 1.3).
5. Confirm whether `/api/clients` (`auth: "secret"`, no internal caller) is still needed.
6. Consider rotating the shared `0420` code, which is currently identical across four gates *and* the partner portal.
7. Run the five RLS verification probes in migration `20260824193000`'s trailing comment — **as each admin with their own session**, never as the service role.

---

*End of audit. No application code was modified in producing this report.*

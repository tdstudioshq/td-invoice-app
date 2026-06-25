# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: Next.js version

This project uses **Next.js 16.2.9** with **React 19**. The pinned guidance in `AGENTS.md` is not optional: APIs and conventions differ from older Next.js. Before writing or changing any Next.js code, read the relevant guide under `node_modules/next/dist/docs/` (`01-app`, `02-pages`, `03-architecture`).

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # bare eslint over the project (flat config: eslint.config.mjs)
npx tsc --noEmit # typecheck (no dedicated script)
```

`next lint` was **removed in Next 16** — use `npm run lint`. There is no `lint:fix` script and no dedicated `typecheck` script; run `eslint --fix` / `tsc --noEmit` directly. There is no test setup yet.

## Conventions

App Router project. `app/layout.tsx` is the root layout (loads Geist + JetBrains Mono fonts, applies `font-mono` globally via CSS variables).

- **Import alias:** `@/*` maps to the repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- **Styling:** Tailwind CSS **v4** — there is no `tailwind.config.*`. Configuration and theme tokens live in `app/globals.css` via CSS (`@theme`/CSS variables); PostCSS is wired in `postcss.config.mjs` with `@tailwindcss/postcss`.
- **UI components:** shadcn/ui (`components.json`), style `radix-lyra`, base color `neutral`, RSC enabled. Generated primitives live in `components/ui/`. Icon library is **Phosphor** (`@phosphor-icons/react`) — prefer it over `lucide-react` (a direct dependency, but only because shadcn primitives pull it in; don't reach for it in app code). Add components with the `shadcn` CLI rather than hand-writing primitives.
- **`cn()` helper:** `lib/utils.ts` merges classes with `clsx` + `tailwind-merge`; use it for conditional classNames.

## Architecture

A Supabase-backed invoicing app: clients, auto-numbered invoices with line items / tax / discounts, payments, and a dashboard. Read the `README.md` for the feature/route map; the points below are the non-obvious wiring.

### Routes & rendering

- Admin app lives under the `app/(app)/` route group, wrapped by `AppShell` (sidebar + mobile sheet nav). Client-portal pages live under the separate `app/(portal)/` group (`/portal/*`), wrapped by its own shell. `app/page.tsx` (outside both groups) is the public sign-in screen, reused by `/login`.
- Both data-backed groups set `export const dynamic = "force-dynamic"` in their `layout.tsx` because every page reads from Supabase per request. Keep new data-backed pages inside the appropriate group.
- `proxy.ts` (Next.js 16's renamed Middleware, Node.js runtime) runs on every request: it refreshes the Supabase session (rotating cookies) and optimistically redirects unauthenticated users to `/login` and authenticated users away from it. `PUBLIC_PATHS` = `/`, `/login`, `/reset-password`. The proxy is **not** the real gate — enforcement is Postgres RLS plus `requireUser()`/`requireAdmin()`/`requirePortalUser()` in Server Components and Actions.

### Data flow

- **Reads:** `lib/data.ts` holds core query helpers (`getInvoices`, `getInvoice`, `getDashboardStats`, etc.); feature-specific Social Hub reads live in `lib/social/data.ts`. Both are called directly from Server Components.
- **Writes:** Server Actions in `app/actions/` (`"use server"`): `clients`, `invoices`, `settings`, and `social` for the admin app; `auth` (sign in/out, password reset), `portal` (admin-side portal-user + file management), and `portal-client` (client-side portal uploads). They validate inputs, authenticate inside each action, then `revalidatePath(...)` the affected routes. Forms are client components using `useActionState` against the shared `ActionState` shape in `app/actions/types.ts` (`{ error?, fieldErrors?, success? }`) or progressive-enhancement forms with `useFormStatus`.
- **Graceful degradation:** every read/write first checks `isSupabaseConfigured()` and returns a safe fallback (empty array / `null` / a "not configured" error) when env vars are absent. This is deliberate — the app builds and the UI renders empty states with no database. Preserve this guard in new data code.

### Three Supabase clients (do not mix them)

1. **SSR client** — `lib/supabase/server.ts` (`createClient()`) and `client.ts`, via `@supabase/ssr`. Used by Server Components and Server Actions; RLS-scoped through the anon key + auth cookies. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Route-handler client** — `lib/supabase/with-supabase.ts` (`supabaseRoute(config, handler)`), via `@supabase/server`. Used only by API routes under `app/api/` (e.g. `app/api/clients/route.ts`). `ctx.supabase` is RLS-scoped; `ctx.supabaseAdmin` bypasses RLS. `auth: "secret"` requires the secret key in the `apikey` header; `auth: "none"` is for public endpoints (e.g. `app/api/health/route.ts`, an unauthenticated health check). Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`.
3. **Service-role admin client** — `lib/supabase/admin.ts` (`createAdminClient()`, guarded by `isSupabaseAdminConfigured()`), via `@supabase/supabase-js`. **Bypasses RLS.** Use only on the server, only inside `requireAdmin()`-guarded Server Actions, and only for privileged operations the cookie-scoped client can't do (currently creating client-portal auth users via `auth.admin.createUser`). Never import it into a Client Component or return its results unfiltered. Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

### Auth & roles

- **Auth is live** (Supabase Auth, email/password). Helpers in `lib/auth.ts`: `getUser()`/`requireUser()` (any session), `requireAdmin()`, and `getPortalContext()`/`requirePortalUser()`. Self-serve sign-up is disabled — users are created in the Supabase dashboard or, for portal users, via the admin action.
- Two roles, decided implicitly by a `client_users` row: an authenticated user **without** one is an **admin** (full `app/(app)` dashboard); one **with** an active (`revoked_at is null`) row is a **portal user**, confined to `/portal/*` and mapped to exactly one client. `signInAction` routes each to the correct home.

### Invoice totals & status — computed in two agreeing places

- Totals (`subtotal`, `discount_amount`, `tax_amount`, `total`) are derived **both** in the browser via `calculateTotals()` in `lib/invoice.ts` (live preview while editing) **and** authoritatively in Postgres via triggers on save (`supabase/migrations/0001_initial_schema.sql`). Changing the formula means changing both. Server Actions never write totals directly — they write rates/items and let the triggers recompute.
- An invoice's stored `status` is not the whole story: `effectiveStatus()` in `lib/invoice.ts` treats a `sent` invoice past its `due_date` as `overdue` at read time. Use it for display rather than `invoice.status` directly.
- Invoice numbers (`TD-INV-0001`…) come from a Postgres sequence/trigger; never set `invoice_number` from app code.

### Database schema & types

- Schema is built from migrations in `supabase/migrations/`, applied **in order** via the Supabase SQL Editor or `supabase db push` (see README):
  - `0001_initial_schema.sql` — `clients`, `invoices`, `invoice_items`, `payments`, `company_settings`; the `TD-INV-####` numbering sequence and total-calculation triggers.
  - `0002_auth_and_owner_scoping.sql` — adds `owner_id` to every table and **tightens RLS to `auth.uid()`** (no more permissive anon access).
  - `0003_client_portal.sql` — `client_users`, `client_file_folders`, `client_files`, `file_activity`; additive portal-scoped `SELECT` policies (via `portal_client_id()`) with admin write policies preserved.
  - `0004_client_files_storage.sql` — creates the **private `client-files` Storage bucket** and `storage.objects` policies mirroring the table policies.
  - `0005_instagram_leads.sql` — owner-scoped Instagram Leads CRM records.
  - `0006_social_hub.sql` — owner-scoped `social_accounts`, `social_posts`, and `social_sync_logs` cache tables. No Instagram token column exists.
- `lib/types/database.ts` is a **hand-maintained mirror** of that schema (the `Database` generic typing all Supabase clients). When you change the SQL, update this file too — or regenerate with `supabase gen types typescript --local > lib/types/database.ts`.
- **RLS is owner-scoped:** every table carries an `owner_id` and is scoped to `auth.uid()`. The public anon key cannot read or write data; users only see their own records, and portal users only see their one client's rows. Server Actions and the PDF route run through the cookie-scoped client (no RLS bypass) — only `lib/supabase/admin.ts` bypasses RLS, for the narrow portal-user-creation case.

### Client portals & secure file storage

- Admins manage portal logins and files under `/client-portals` (`app/actions/portal.ts`); portal users live under `/portal/*` (`app/actions/portal-client.ts`). Files are organized into three categories — `uploads` / `final_files` / `invoices` — mapped to storage path prefixes in `lib/portal.ts`.
- Files live in the **private `client-files` bucket**, keyed `{clientId}/{prefix}/{safeName}`. They are never served by raw object URL: downloads go through `app/api/files/[fileId]/route.ts`, which authorizes the request and returns a short-lived **signed URL**. Portal users can upload only when the admin has enabled it (enforced in the action *and* by Storage + table RLS).

### PDF export

- Invoice PDFs are generated server-side with **pdf-lib**. `lib/pdf/invoice-pdf-data.ts` maps an invoice to the PDF's data shape and `lib/pdf/invoice-pdf.ts` renders it. `app/api/invoices/[id]/pdf/route.ts` serves the download (`TD-INV-####.pdf`); the same data mapping feeds the emailed attachment so downloaded and emailed PDFs are identical.

### Email (Resend) — implemented

Transactional email is sent via **Resend** (`lib/email/`: `client.ts` exposes `getResend()`, `isResendConfigured()`, `EMAIL_FROM`; `templates.ts` holds the HTML).
- **Email an invoice:** `sendInvoiceAction` (`app/actions/invoices.ts`) renders + attaches the PDF, emails the client, and promotes a `draft` invoice to `sent`.
- **Portal invites:** `createPortalUserAction` (`app/actions/portal.ts`) emails a set-password link when Resend is configured, falling back to a one-time temp-password reveal otherwise.
- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (server-only). Both flows degrade gracefully when unset.

### Social Hub (Instagram) — Phase 1 read-only

- Admin UI lives at `/social`; reusable cards/grid live in `components/social/`.
- `lib/social/instagram.ts` is server-only and calls Meta Graph API v25.0 with
  `INSTAGRAM_ACCESS_TOKEN` in the Authorization header. Never move this token
  into a client component, a `NEXT_PUBLIC_*` variable, or a database row.
- `syncInstagramAction` in `app/actions/social.ts` calls `requireAdmin()`, fetches
  the profile/latest media, and upserts the cache through the cookie-scoped
  Supabase client, preserving RLS.
- Env: `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`; optional
  `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` (`appsecret_proof`).
- Phase 1 does not publish, fetch analytics, process DMs, sync followers, or
  modify the mobile app.

### PWA & mobile

- Ships a Web App Manifest (`app/manifest.ts`) and maskable icons; installable and launches standalone to `/dashboard`. Shells apply `env(safe-area-inset-*)` padding for notch/home-indicator safety, and invoice/line-item layouts have dedicated mobile treatments.

### Roadmap stubs

Stripe payments remain stubbed. Social roadmap: follower-to-Leads sync, post
analytics, AI captions, content calendar/scheduling, lead scoring/CRM
conversion, and mobile Social Hub.

## Mobile companion app (`mobile/`)

`mobile/` is a **separate, self-contained Expo workspace** — not part of the Next.js build. It is deliberately excluded from the root toolchain (`tsconfig.json` `exclude`, `eslint.config.mjs` ignores, its own `node_modules`), so run all mobile commands from inside `mobile/` with its own deps:

```bash
cd mobile
npm install
cp .env.example .env   # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY / EXPO_PUBLIC_API_BASE_URL
npx expo start         # then scan QR with Expo Go (iOS), or `npm run ios` for the Simulator
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
```

- **Stack:** Expo SDK 54 (pinned for Expo Go physical-device testing), React Native 0.81, React 19, **Expo Router** (file-based routes under `mobile/app/`, `typedRoutes` on). Mirrors the web app's two role-based route groups: `(admin)/` and `(portal)/`.
- **Same backend, same RLS, anon key only:** connects to the **same Supabase project** with only the anon key + existing RLS. **No service-role client, no schema changes, no Stripe/Resend.** Never put a service-role key in the mobile app. Every read and write is RLS-scoped to the signed-in user's own access token — the app can only do what that user could do on the web.
- **It is no longer strictly read-only.** Admin/portal browsing is still read-only, but two portal features write or call out:
  - **Native PDF viewer (#4):** `InvoicePdfButton` downloads the authoritative pdf-lib PDF from the web app's existing `/api/invoices/[id]/pdf` route (via `expo-file-system` `downloadAsync`), previews it natively in a WebView, and shares the real file. Auth is the user's Supabase access token sent as `Authorization: Bearer` — the **only** web change this required was making `lib/supabase/server.ts` `createClient()` forward that header to PostgREST when present (a no-op for cookie/browser requests; still RLS-scoped, no service-role). Falls back to a locally rendered HTML invoice (`mobile/src/lib/invoice-html.ts`) when offline or when `EXPO_PUBLIC_API_BASE_URL` is unset. Requires `EXPO_PUBLIC_API_BASE_URL` (the deployed web app URL).
  - **Camera / document uploads (#5):** portal users with `can_upload` upload PDF/JPG/PNG/HEIC (≤ 25 MB) from camera, library, or Files into the existing private `client-files` bucket. **No new upload infrastructure and no schema change** — `mobile/src/lib/uploads.ts` writes straight to Storage + inserts `client_files`/`file_activity` rows exactly like the web `uploadOwnFileAction`, gated entirely by the existing storage + table RLS (`portal_client_id()` + `portal_can_upload()`, uploads-category only). The Storage write uses `expo-file-system` `createUploadTask` against the Storage REST endpoint (bearer = user token, apikey = anon key) to get **upload progress + cancellation**; metadata inserts go through supabase-js. Entry points: portal **Files → Upload** and portal **Invoice → Upload Supporting Document** (`mobile/src/components/upload-document.tsx`).
- **Biometric app lock (#6):** an optional Face ID / Touch ID gate via `expo-local-authentication`, implemented as `BiometricProvider` (`mobile/src/providers/biometric-provider.tsx`) wrapping the navigator *inside* `AuthProvider` in `app/_layout.tsx`. It renders a full-screen lock **overlay** on top of the router, so admin/portal routing is untouched. It only ever gates an **already-authenticated** session — it never blocks first login, and locks on cold start with a persisted session and on return from background (`AppState` "background"). Graceful fallback: if biometrics aren't available/enrolled it fails open and the Settings toggle is disabled with an explanation. The **only** persisted state is a local-only `biometric_lock_enabled` boolean in `expo-secure-store` — **no passwords or tokens are stored.** Toggle lives in both settings screens (`BiometricSettingCard`).
- **Two things share, not duplicate, the web app:** the database types are re-exported from the web app via a relative bridge (`mobile/src/types/database.ts` → `../../../lib/types/database`), so the web schema mirror is the single source of truth. Mobile reads live in `mobile/src/lib/data.ts` (its own copy, parallel to the web `lib/data.ts`).
- **Session persistence** uses `expo-sqlite/localStorage/install` (imported first in `mobile/src/lib/supabase.ts`) as the storage backend, with `processLock` and AppState-driven `startAutoRefresh`/`stopAutoRefresh`. `isSupabaseConfigured` gates the same graceful-degradation pattern as the web app.
- No EAS build / store submission is configured yet (see `mobile/README.md`).

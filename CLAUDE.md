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
npm run lint     # eslint (flat config: eslint.config.mjs)
```

There is no test setup yet.

## Conventions

App Router project. `app/layout.tsx` is the root layout (loads Geist + JetBrains Mono fonts, applies `font-mono` globally via CSS variables).

- **Import alias:** `@/*` maps to the repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- **Styling:** Tailwind CSS **v4** — there is no `tailwind.config.*`. Configuration and theme tokens live in `app/globals.css` via CSS (`@theme`/CSS variables); PostCSS is wired in `postcss.config.mjs` with `@tailwindcss/postcss`.
- **UI components:** shadcn/ui (`components.json`), style `radix-lyra`, base color `neutral`, RSC enabled. Generated primitives live in `components/ui/`. Icon library is **Phosphor** (`@phosphor-icons/react`) — prefer it over lucide (which is installed only as a shadcn transitive dep). Add components with the `shadcn` CLI rather than hand-writing primitives.
- **`cn()` helper:** `lib/utils.ts` merges classes with `clsx` + `tailwind-merge`; use it for conditional classNames.

## Architecture

A Supabase-backed invoicing app: clients, auto-numbered invoices with line items / tax / discounts, payments, and a dashboard. Read the `README.md` for the feature/route map; the points below are the non-obvious wiring.

### Routes & rendering

- Authenticated app lives under the `app/(app)/` route group, wrapped by `AppShell` (sidebar + mobile sheet nav). `app/page.tsx` (outside the group) is the public landing page.
- The `(app)` group sets `export const dynamic = "force-dynamic"` in its `layout.tsx` because every page reads from Supabase per request. Keep new data-backed pages inside this group.

### Data flow

- **Reads:** `lib/data.ts` holds all query helpers (`getInvoices`, `getInvoice`, `getDashboardStats`, etc.), called directly from Server Components.
- **Writes:** Server Actions in `app/actions/{clients,invoices,settings}.ts` (`"use server"`). They validate `FormData` with **zod**, then `revalidatePath(...)` the affected routes and `redirect(...)`. Forms are client components using `useActionState` against the shared `ActionState` shape in `app/actions/types.ts` (`{ error?, fieldErrors?, success? }`); `react-hook-form` is a dependency but the forms are plain `<form action={...}>` + `FormData`, not RHF.
- **Graceful degradation:** every read/write first checks `isSupabaseConfigured()` and returns a safe fallback (empty array / `null` / a "not configured" error) when env vars are absent. This is deliberate — the app builds and the UI renders empty states with no database. Preserve this guard in new data code.

### Two distinct Supabase clients (do not mix them)

1. **SSR client** — `lib/supabase/server.ts` (`createClient()`) and `client.ts`, via `@supabase/ssr`. Used by Server Components and Server Actions; RLS-scoped through the anon key + auth cookies. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. **Route-handler client** — `lib/supabase/with-supabase.ts` (`supabaseRoute(config, handler)`), via `@supabase/server`. Used only by API routes under `app/api/` (e.g. `app/api/clients/route.ts`). `ctx.supabase` is RLS-scoped; `ctx.supabaseAdmin` bypasses RLS. `auth: "secret"` requires the secret key in the `apikey` header. Env: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`.

### Invoice totals & status — computed in two agreeing places

- Totals (`subtotal`, `discount_amount`, `tax_amount`, `total`) are derived **both** in the browser via `calculateTotals()` in `lib/invoice.ts` (live preview while editing) **and** authoritatively in Postgres via triggers on save (`supabase/migrations/0001_initial_schema.sql`). Changing the formula means changing both. Server Actions never write totals directly — they write rates/items and let the triggers recompute.
- An invoice's stored `status` is not the whole story: `effectiveStatus()` in `lib/invoice.ts` treats a `sent` invoice past its `due_date` as `overdue` at read time. Use it for display rather than `invoice.status` directly.
- Invoice numbers (`TD-INV-0001`…) come from a Postgres sequence/trigger; never set `invoice_number` from app code.

### Database schema & types

- Schema source of truth is `supabase/migrations/0001_initial_schema.sql`. Apply it via the Supabase SQL Editor or `supabase db push` (see README).
- `lib/types/database.ts` is a **hand-maintained mirror** of that schema (the `Database` generic typing both Supabase clients). When you change the SQL, update this file too — or regenerate with `supabase gen types typescript --local > lib/types/database.ts`.
- **No auth yet:** RLS is enabled but policies are permissive for anon/authenticated. The `TODO(auth)` note atop the migration tracks scoping policies to `auth.uid()` once login exists.

### Roadmap stubs

Stripe (payments reconciliation) and Resend (emailing invoices, flipping status to `sent`) are stubbed as `TODO(stripe)` / `TODO(resend)` in `app/actions/invoices.ts` and `.env.example`.

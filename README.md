# TD Studios — Invoice App

A production-ready invoicing application for TD Studios. Manage clients, create
auto-numbered invoices with line items, tax, and discounts, and track payments —
in a focused, dark, zinc-themed workspace.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**,
**Tailwind CSS v4**, **shadcn/ui**, and **Supabase** (Postgres).

## Features

- **Dashboard** — total invoiced, total paid, outstanding balance, overdue
  invoices, and a recent invoices table.
- **Clients** — create, edit, and delete clients (company, contact, email,
  phone, address, notes).
- **Invoices** — auto-incrementing numbers (`TD-INV-0001`+), Draft / Sent /
  Paid / Overdue statuses, multiple line items (description, quantity, unit
  price), tax %, discount %, notes, and due dates.
- **Live totals** — subtotal, discount, tax, and total computed as you type and
  re-derived in the database on save.
- **Settings** — company details and default tax rate used on every invoice.
- **Authentication** — Supabase Auth (email/password) with owner-scoped Row
  Level Security; every user sees only their own data.
- **Client portals** — give a client a scoped login to view only their own
  files and invoices, with secure file storage via a private bucket and
  short-lived signed URLs.
- **PDF export** — server-rendered invoice PDFs (`TD-INV-####.pdf`), identical
  for download and email attachment.
- **Email (Resend)** — email an invoice (with PDF) to a client and send portal
  invites with a set-password link.
- **Leads CRM** — searchable, paginated Instagram lead records cached in
  Supabase.
- **Social Hub foundation** — dormant read-only Instagram profile/recent-post
  sync UI and cache tables. It uses the official Meta Graph API only after
  server-only Instagram env vars are configured.
- **Mobile responsive / PWA** — collapsible sidebar with a sheet-based mobile
  nav; installable Web App Manifest that launches standalone.

## Routes

| Route             | Description                              |
| ----------------- | ---------------------------------------- |
| `/`               | Landing page                             |
| `/dashboard`      | KPIs + recent invoices                   |
| `/clients`        | Client list                              |
| `/clients/new`    | Create a client                          |
| `/clients/[id]`   | View / edit / delete a client            |
| `/invoices`       | Invoice list                             |
| `/invoices/new`   | Create an invoice                        |
| `/invoices/[id]`  | Invoice document (add `?edit=1` to edit) |
| `/leads`          | Search and browse imported leads         |
| `/social`         | Dormant Instagram Social Hub             |
| `/settings`       | Company settings                         |
| `/client-portals` | Admin: manage client portal logins & files |
| `/client-portals/[clientId]` | Admin: one client's portal access + file manager |
| `/portal`         | Client portal: overview                  |
| `/portal/files`   | Client portal: view/download/upload files |
| `/portal/invoices`| Client portal: view/download invoice PDFs |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `.env.example` to `.env.local` and fill in your values:

   ```bash
   cp .env.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

   Find both under **Project Settings → API**.

> The app runs without these set — it just shows empty states — so you can build
> and explore the UI before wiring up the database.

### 3. Apply the database migration

Run the SQL in `supabase/migrations/0001_initial_schema.sql` against your
database. Either:

- **Supabase SQL Editor**: paste the file contents and run it, **or**
- **Supabase CLI**:

  ```bash
  supabase link --project-ref your-project-ref
  supabase db push
  ```

This creates the `clients`, `invoices`, `invoice_items`, `payments`, and
`company_settings` tables, the `TD-INV-####` numbering sequence, total-calculation
triggers, and a seeded `company_settings` row.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Description                |
| --------------- | -------------------------- |
| `npm run dev`   | Start the dev server       |
| `npm run build` | Production build           |
| `npm run start` | Serve the production build |
| `npm run lint`  | Run ESLint                 |

## Project structure

```
app/
  (app)/              Admin app shell (sidebar layout, force-dynamic)
    dashboard/        KPIs + recent invoices
    clients/          List, new, [id]
    invoices/         List, new, [id]
    leads/            Searchable Leads CRM
    social/           Dormant Instagram Social Hub
    settings/         Company settings
    client-portals/   Admin: manage portal logins & files
  (portal)/           Client-portal shell (force-dynamic)
    portal/           Overview, files, invoices
  actions/            Server Actions: clients, invoices, settings, social,
                      auth, portal (admin-side), portal-client (client-side)
  api/                Route handlers: invoice PDF, file downloads, clients,
                      health
  login/              Sign-in panel + forgot-password form
  reset-password/     Password reset flow
  page.tsx            Public sign-in screen (reused by /login)
  layout.tsx          Root layout (dark, fonts, metadata)
  manifest.ts         PWA Web App Manifest
components/
  layout/             App shell, sidebar nav, brand, page header
  clients/            Client form
  invoices/           Invoice form, table, status badge/control
  settings/           Settings form
  dashboard/          Stat card
  portal/             Portal + file-manager UI
  shared/             Submit button, delete dialog, empty state
  ui/                 shadcn/ui primitives
lib/
  supabase/           SSR, route-handler, and service-role clients
  types/database.ts   Database types (hand-maintained schema mirror)
  auth.ts             requireUser / requireAdmin / portal context helpers
  data.ts             Read queries (with safe fallbacks)
  invoice.ts          Totals + status helpers
  portal.ts           Portal category ↔ storage-path mapping
  pdf/                Invoice PDF data mapping + renderer (pdf-lib)
  email/              Resend client + HTML templates
  social/             Instagram Graph API client + cached Social Hub reads
  format.ts           Currency / date / percent formatting
proxy.ts              Session refresh + auth redirects (Next.js 16 middleware)
supabase/
  migrations/         SQL schema (0001–0006, applied in order)
```

## Data model

- **clients** — company/contact info.
- **invoices** — number, client, status, dates, tax/discount rates, and
  trigger-maintained `subtotal` / `discount_amount` / `tax_amount` / `total`.
- **invoice_items** — line items (description, quantity, unit price, position).
- **payments** — payments recorded against an invoice.
- **company_settings** — single-row company profile and default tax rate.
- **leads** — owner-scoped Instagram lead records.
- **social_accounts** — cached Instagram profile and connection state.
- **social_posts** — cached Instagram media and engagement counts.
- **social_sync_logs** — manual sync history and errors.

Totals are computed in two places that always agree: live in the browser while
editing (`lib/invoice.ts`) and authoritatively in Postgres via triggers on save
(see the migration).

## Calculations

```
subtotal        = Σ(quantity × unit_price)
discount_amount = subtotal × discount_rate / 100
tax_amount      = (subtotal − discount_amount) × tax_rate / 100
total           = subtotal − discount_amount + tax_amount
```

## Security

The app uses **Supabase Auth** (email/password). All `app/(app)` routes are
gated by `proxy.ts` (session refresh + redirect) and re-checked in the route
group layout. Every table has an `owner_id` and **Row Level Security scoped to
`auth.uid()`** (migration `0002`), so the public anon key cannot read or write
data and users only ever see their own records. Server Actions and the PDF route
run through the cookie-scoped client — no service-role/RLS bypass.

## Client Portals & secure file storage

Clients can be given a **portal login** to view only their own files and
invoices, without touching the admin app.

### Roles

There are two roles, decided implicitly:

- **Admin** — any authenticated user **without** a `client_users` row. Admins use
  the full `app/(app)` dashboard.
- **Client portal user** — a user **with** an active (`revoked_at is null`)
  `client_users` row mapping them to exactly one client. They are confined to
  `/portal/*` and can never reach the dashboard.

`requireAdmin()` / `requirePortalUser()` in `lib/auth.ts` enforce this in every
layout, and `signInAction` routes each user to the right home on login.

### What admins can do (`/client-portals`)

- Create a portal login for a client (generates the auth user + a **one-time
  temporary password shown once** — share it securely; the client can reset it
  via "Forgot password").
- Toggle whether a client may upload files; revoke access (deletes the login).
- Upload files into three categories (Uploads / Final Files / Invoices),
  organize with folders, rename, and delete.

### What clients can do (`/portal`)

- See only their own client's files and **non-draft** invoices.
- Download files and invoice PDFs via short-lived **signed URLs**
  (`/api/files/[fileId]`) — the bucket is private and raw object URLs are never
  exposed.
- Upload files **only** when the admin has enabled it (enforced in the server
  action *and* by Storage + table RLS).

### Data model & RLS (migrations `0003`/`0004`)

- New tables: `client_users`, `client_file_folders`, `client_files`,
  `file_activity` — all `owner_id`-scoped to the admin like the existing tables.
- The change to existing tables is **additive**: portal users get extra
  permissive `SELECT` policies (scoped by `portal_client_id()`), and the existing
  write policies are tightened so a portal login can never write to
  `clients`/`invoices`/etc. Admin behavior is unchanged.
- Files live in a **private `client-files` bucket**, keyed
  `{client_id}/{uploads|final-files|invoices}/…`. `storage.objects` policies
  mirror the table policies.

### Supabase setup

1. **Apply migrations** `0003_client_portal.sql` then `0004_client_files_storage.sql`
   (SQL Editor or `supabase db push`). `0004` creates the private `client-files`
   bucket automatically.
2. **Confirm the bucket** exists and is **not public** (Storage → Buckets →
   `client-files`).
3. **Env** — creating portal logins uses the service-role key, so
   `SUPABASE_URL` and `SUPABASE_SECRET_KEY` must be set (already in
   `.env.example`).

### Testing checklist

- As an admin, open `/client-portals`, create a login for a client, copy the
  temp password, upload a file into each category, create/rename a folder, toggle
  uploads.
- In an incognito window, sign in as the portal user: you land on `/portal`;
  `/portal/files` shows only that client's files (downloads work); upload appears
  only when enabled; `/portal/invoices` lists only that client's non-draft
  invoices and the PDF downloads. `/dashboard` and `/client-portals` redirect away.
- Cross-tenant: requesting another client's `fileId` or invoice id returns 404.
- Revoke access → that user can no longer sign in to the portal.

## Email (Resend)

Transactional email is sent via [Resend](https://resend.com) for two flows:

- **Email an invoice** — the "Email to client" button on an invoice sends the
  client the PDF and marks a `draft` invoice as `sent`
  (`sendInvoiceAction` in `app/actions/invoices.ts`).
- **Portal invites** — creating a portal login emails the client a
  set-password link instead of the admin sharing a temporary password
  (`createPortalUserAction` in `app/actions/portal.ts`).

Setup:

1. **Verify a sender domain** in Resend (add the DNS records it provides) — e.g.
   `invoices.tdstudiosny.com`.
2. Set the env vars (locally in `.env.local`, and in **Vercel** for production):

   ```
   RESEND_API_KEY=re_...
   RESEND_FROM_EMAIL=TD Studios <invoices@invoices.tdstudiosny.com>
   ```

   `RESEND_FROM_EMAIL` must be an address on the verified domain.

**Graceful degradation:** with these unset the app still builds and runs — the
invoice-email button reports email isn't configured, and portal invites fall
back to a one-time temp password shown to the admin. Both env vars are
**server-only** (never `NEXT_PUBLIC_`).

## Social Hub (Instagram)

Phase 1 foundation exists at `/social`, but it is currently **dormant**.
`supabase/migrations/0006_social_hub.sql` has already been applied to the
remote Supabase project, so the owner-scoped `social_accounts`, `social_posts`,
and `social_sync_logs` tables are in place. Instagram credentials are **not**
configured, so manual sync remains inactive and the page should show a
not-configured state.

When credentials are added later, the module uses the official Instagram API
with Facebook Login / Meta Graph API v25.0 to fetch the connected professional
account profile and latest media. Profile metadata, posts, and sync results are
cached in Supabase; the access token stays in server-only environment variables
and is never written to Postgres or sent to the browser.

### Meta account requirements

1. Use an Instagram **Professional** account (Business or Creator). For the
   Facebook Login flow, connect it to a Facebook Page.
2. Create a Meta developer app and add the Instagram API with Facebook Login.
3. Ensure the authenticating Facebook user can manage the linked Page.
4. Request the read permissions required by Meta for the selected setup,
   typically `instagram_basic`, `pages_show_list`, and
   `pages_read_engagement`. Development-mode apps can test with app-role users;
   production use may require App Review and Advanced Access.
5. Generate a long-lived user access token and obtain the Instagram
   Professional Account ID from the linked Page.

Official references:

- [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/)
- [Instagram API with Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/)
- [Getting started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started)

### Configuration

The remote migration is already applied. To activate sync later, set:

```bash
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_BUSINESS_ACCOUNT_ID=...
INSTAGRAM_APP_ID=...       # optional in Phase 1
INSTAGRAM_APP_SECRET=...   # optional; enables appsecret_proof
```

All four variables are server-only—do not prefix them with `NEXT_PUBLIC_`.
Restart the dev server after changing them. Sign in as an admin, open
`/social`, and click **Refresh**. The page displays connection state, last sync,
profile counts, cached posts, and any Meta API error.

Current production/local status: these Instagram env vars are intentionally not
configured, and future Instagram phases are paused.

The sync currently caches the latest 24 posts. It does not publish content,
fetch insights, process DMs, or sync followers.

## Install as an app (PWA)

The app ships a Web App Manifest (`app/manifest.ts`) and maskable icons, so it's
installable from a supported browser ("Add to Home Screen" / install icon). It
launches standalone to `/dashboard`.

## Roadmap (not yet implemented)

- **Stripe** — collect payments and reconcile them against invoices
  (`app/actions/invoices.ts`, `.env.example`).
- Instagram phases are paused until explicitly resumed:
  - follower sync into Leads
  - post analytics dashboard
  - AI caption generation
  - content calendar and scheduled publishing
  - lead scoring and CRM conversion from Instagram followers
  - mobile Social Hub

## Deploy to Vercel

### Deployment checklist

1. **Database** — apply migrations to your Supabase project (in order):
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_auth_and_owner_scoping.sql`
   - `supabase/migrations/0003_client_portal.sql`
   - `supabase/migrations/0004_client_files_storage.sql`
   - `supabase/migrations/0005_instagram_leads.sql`
   - `supabase/migrations/0006_social_hub.sql`

   via the SQL Editor, or `supabase db push` if linked. In the current remote
   project, `0006_social_hub.sql` has already been applied. Verify `owner_id` exists
   on all tables and policies are owner-scoped (no `*_all_access`), and that the
   private `client-files` Storage bucket was created (see "Client Portals" above).
2. **Create a user** — Supabase dashboard → Authentication → Users → Add user
   (check *Auto Confirm*). Self-serve sign-up is intentionally disabled.
3. **Environment variables** — set these in the Vercel project (Production +
   Preview):

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | SSR client |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | SSR client (public) |
   | `SUPABASE_URL` | ✅ | API route handlers |
   | `SUPABASE_PUBLISHABLE_KEY` | ✅ | API route handlers |
   | `SUPABASE_SECRET_KEY` | ✅ | **server-only**, never expose |
   | `SUPABASE_JWKS_URL` | ✅ | JWT verification |
   | `NEXT_PUBLIC_SITE_URL` | optional | custom domain; otherwise `VERCEL_URL` is used |

4. **Build settings** — defaults work: build `next build`, output auto-detected,
   Node.js 20+. No `vercel.json` needed.
5. **Deploy**, then smoke-test:
   - `/login` loads and authenticates → redirects to `/dashboard`
   - create a client/invoice; confirm it's scoped to your user
   - **Download PDF** on an invoice returns `TD-INV-####.pdf`
   - sign out → returns to `/login`; visiting `/dashboard` redirects to `/login`

> Tip: keep `SUPABASE_SECRET_KEY` out of any `NEXT_PUBLIC_*` variable — only the
> anon key is safe to expose to the browser.

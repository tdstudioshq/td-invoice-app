# TD Studios — Invoice App

A production-ready invoicing application for TD Studios. Manage clients, create
auto-numbered invoices with line items, tax, and discounts, and track payments —
in a focused, dark, zinc-themed workspace. Alongside the invoicing core it hosts
a client portal, a QR code platform, several public print tools, and a public
custom-printing quote wizard.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**,
**Tailwind CSS v4**, **shadcn/ui**, and **Supabase** (Postgres).

> **Working on this codebase?** `CLAUDE.md` is the detailed architecture guide
> and is the source of truth when it disagrees with this file.

## Features

### Invoicing core

- **Invoices** — auto-incrementing numbers (`TD-INV-0001`+), Draft / Sent /
  Paid / Overdue statuses, multiple line items (description, quantity, unit
  price), tax %, discount %, notes, and due dates.
- **Live totals** — subtotal, discount, tax, and total computed as you type and
  re-derived in the database on save.
- **Clients** — create, edit, and delete clients (company, contact, email,
  phone, address, notes).
- **Payments** — record payments against an invoice and track the outstanding
  balance.
- **PDF export** — server-rendered invoice PDFs (`TD-INV-####.pdf`), identical
  for download and email attachment.
- **Email (Resend)** — email an invoice (with PDF) to a client and send portal
  invites with a set-password link.
- **Dashboard** — a task manager (quick-add, priorities, due dates, optional
  client link). Invoice KPIs and the recent-invoices table live on `/invoices`.
- **Settings** — company details and default tax rate used on every invoice.

### Client portals

- **Scoped logins** — give a client a login that sees only their own files and
  invoices, never the admin app.
- **Projects** — group a client's files under a named unit of work with a status
  workflow (draft → in progress → awaiting review → revision requested →
  approved → completed → archived).
- **Secure file storage** — a private Storage bucket served only through
  short-lived signed URLs; per-user favorites, search/sort, thumbnails, preview
  modal, and an activity timeline.
- **View as client** — admins can preview a client's portal with the portal's
  own visibility rules re-applied.

### QR code platform

- **Static and dynamic codes** — a dynamic code prints a stable `/q/<slug>` short
  link whose destination can be repointed or disabled without reprinting.
- **Styling** — foreground/background colors, error-correction level, and an
  optional embedded logo; export as PNG, SVG, or PDF.
- **Scan analytics** — privacy-preserving scan logging (salted, truncated IP
  hash; coarse device class; country) plus a generation history.

### Public pages and tools (no login)

- **Print tools** — Cutline Generator (print-ready PDF with a vector cut
  contour), Mylar Bag Mockup Generator (single bag), 8-Piece Mockup Generator
  (full sheet), and Bag Mockup Grid (a lineup in a 4-column grid).
- **Custom Mylar Printing** — a five-step quote wizard that stores the inquiry,
  takes artwork uploads into private Storage, and notifies the studio. Worked
  from the admin app at `/mylar-requests`.
- **Galleries** — a portfolio and several brand galleries, each backed by its
  own Storage bucket, so uploads appear with no redeploy. Most are public
  buckets; some sit behind a shared 4-digit keypad code, and the premade-designs
  gallery is a **private** bucket served through short-lived signed URLs only
  after that gate passes.
- **Custom design requests** — a public request form that stores the request,
  takes reference uploads into private Storage, and notifies the studio. Worked
  from the admin app at `/design-requests`.
- **Legacy request forms** — an earlier mylar bag order form and the ordering
  page still post to Formspree, with uploads into private Storage.
- **Public QR generator** — the same generator as the admin one, without saving.

### Platform

- **Authentication** — Supabase Auth (email/password + Google OAuth) with
  owner-scoped Row Level Security; every user sees only their own data.
- **Three roles** — admin, client-portal user, and self-signup customer.
- **Mobile responsive / PWA** — collapsible sidebar with a sheet-based mobile
  nav; installable Web App Manifest that launches standalone.

## Routes

### Admin (`app/(app)/`, admin allowlist required)

| Route                        | Description                                      |
| ---------------------------- | ------------------------------------------------ |
| `/dashboard`                 | Task manager                                     |
| `/clients`                   | Client list                                      |
| `/clients/new`               | Create a client                                  |
| `/clients/[id]`              | View / edit / delete a client                    |
| `/invoices`                  | Invoice KPIs + invoice list                      |
| `/invoices/new`              | Create an invoice                                |
| `/invoices/[id]`             | Invoice document (add `?edit=1` to edit)         |
| `/qr`                        | Saved QR codes + generator                       |
| `/qr/[id]`                   | QR code detail, editor, and scan analytics       |
| `/qr/history`                | Every code generated (admin + public)            |
| `/mylar-requests`            | Custom Mylar Printing inquiries                  |
| `/mylar-requests/[id]`       | One inquiry: details, artwork, status            |
| `/design-requests`           | Custom design requests                           |
| `/design-requests/[id]`      | One request: details, reference files, status    |
| `/partner-jobs`              | Print-partner design jobs (all companies)        |
| `/partner-jobs/[jobId]`      | One job: products, files, notes, status          |
| `/client-portals`            | Manage client portal logins & files              |
| `/client-portals/[clientId]` | One client's portal access, projects, and files  |
| `/settings`                  | Company settings                                 |

### Client portal (`app/(portal)/`)

| Route                        | Description                                |
| ---------------------------- | ------------------------------------------ |
| `/portal`                    | Overview: projects, recent files, invoices |
| `/portal/files`              | Asset browser: view / download / upload    |
| `/portal/invoices`           | View and download invoice PDFs             |
| `/portal/projects`           | Project list and detail                    |
| `/portal/account`            | Account and password                       |

### Customer (`app/(customer)/`, self-signup)

| Route          | Description               |
| -------------- | ------------------------- |
| `/onboarding`  | First-run profile setup   |
| `/account`     | Customer account          |

### Print-partner portal (`app/(partner)/`, partner membership required)

A private ordering portal for print companies, served on its own hostname. The
routes really live at `/partner/<slug>/…`; a partner reaches them without ever
seeing that prefix.

| Address (production)                     | Internal route              | Description                  |
| ---------------------------------------- | --------------------------- | ---------------------------- |
| `zazaorders.tdstudiosny.com/`            | `/partner/zaza`             | Redirects to the job list    |
| `zazaorders.tdstudiosny.com/login`       | `/partner/zaza/login`       | Portal sign-in               |
| `zazaorders.tdstudiosny.com/jobs`        | `/partner/zaza/jobs`        | Submitted jobs, newest first |
| `zazaorders.tdstudiosny.com/jobs/new`    | `/partner/zaza/jobs/new`    | File a new design job        |
| `zazaorders.tdstudiosny.com/jobs/[id]`   | `/partner/zaza/jobs/[id]`   | One job: products, files, status |

Locally (and before the subdomain is attached) the same portal is at
`/zaza-orders/…` on the main host, or directly at `/partner/zaza/…`. See
**Print-partner portals** below.

### Public (no session required)

| Route                           | Description                                     |
| ------------------------------- | ----------------------------------------------- |
| `/`                             | Link-in-bio card that flips to the sign-in form  |
| `/login`, `/sign-up`            | Sign in; customer self-signup                   |
| `/reset-password`               | Password recovery                               |
| `/q/<slug>`                     | Dynamic QR redirect + scan logging              |
| `/mylar-printing`               | Custom Mylar Printing quote wizard              |
| `/mylar-bag-printing`           | Earlier mylar bag order form (Formspree)        |
| `/custom-design-request`        | Custom design request form (stored)             |
| `/tools/cutline-generator`      | Cutline Generator                               |
| `/tools/mockup-generator`       | Mylar Bag Mockup Generator (single bag)         |
| `/tools/8pc-mockup-generator`   | 8-Piece Mockup Generator (sheet)                |
| `/tools/bag-mockup-grid`        | Bag Mockup Grid (lineup)                        |
| `/qr-generator`                 | Public QR generator (no saving)                 |
| `/portfolio`                    | Portfolio gallery                               |
| `/premadedesigns`               | Premade designs gallery (keypad-gated)          |
| `/gso`                          | GSO gallery                                     |
| `/taste-budz`, `/designs`, `/mafiaterpz`, `/martyig` | Keypad-gated pages         |
| `/how-to-order`                 | Ordering instructions                           |
| `/mylar`                        | Static single-file mylar shop (`public/mylar/`) |

Public paths are allow-listed in `proxy.ts`. That gate is optimistic — real
enforcement is Postgres RLS plus `requireUser()` / `requireAdmin()` /
`requirePortalUser()` / `requireCustomer()` in Server Components and Actions.

### API routes

| Route                             | Description                                    |
| --------------------------------- | ---------------------------------------------- |
| `/api/health`                     | Unauthenticated health check                   |
| `/api/clients`                    | Client records (secret-key auth)               |
| `/api/invoices/[id]/pdf`          | Invoice PDF download                           |
| `/api/files/[fileId]`             | Portal file download / inline preview          |
| `/api/mylar-artwork/[inquiryId]`  | Signed artwork link (admin only)               |
| `/api/design-request-assets/[requestId]` | Signed reference link (admin only)      |
| `/api/partner-job-files/[fileId]`  | Signed job-file link (partner or admin)        |
| `/api/cutline/generate`           | Cutline PDF — public, in-memory, no storage    |
| `/api/mockup-sheet/generate`      | 8-piece sheet export — public, in-memory       |
| `/api/bag-mockup-grid/generate`   | Bag grid export — public, in-memory            |

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
   ADMIN_EMAILS=you@example.com
   ```

   Find the Supabase values under **Project Settings → API**. `ADMIN_EMAILS` is
   the admin allowlist — **if it is empty, no one can reach the dashboard.**

> The app runs without any of these set — it just shows empty states — so you can
> build and explore the UI before wiring up the database.

### 3. Apply the database migrations

Run every file in `supabase/migrations/` **in order**. The folder holds two
naming schemes that sort correctly together: the original hand-numbered series
(`0001` … `0025`) followed by Supabase CLI timestamps (`20260822182058_…`).
New migrations should use the CLI's timestamps (`supabase migration new`).
Either:

- **Supabase SQL Editor**: paste each file's contents and run it, **or**
- **Supabase CLI**:

  ```bash
  supabase link --project-ref your-project-ref
  supabase db push
  ```

Several migrations create a feature that a later migration drops again (the
Instagram Leads CRM, the Social Hub, and Bio Pages were all removed). Both halves
are kept so a from-scratch rebuild stays correct — apply them all in sequence.

The migrations also create most of the Storage buckets the app needs, all
private: `client-files` (25 MB/file), `design-requests`, and `mylar-artwork`
(50 MB/file). The gallery buckets are **not** created by any migration and must
be added by hand in the Supabase dashboard: the public ones (`custom-work`,
`GSO`, `TASTE BUDZ`, `MAFIA terpz`) and the **private `premade-designs`** bucket
that `/premadedesigns` reads through its manifest RPC. A gallery whose
bucket is missing renders its empty state rather than erroring.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command                       | Description                                    |
| ----------------------------- | ---------------------------------------------- |
| `npm run dev`                 | Start the dev server                           |
| `npm run build`               | Production build                               |
| `npm run start`               | Serve the production build                     |
| `npm run lint`                | Run ESLint (flat config, `eslint.config.mjs`)  |
| `npx tsc --noEmit`            | Typecheck (no dedicated script)                |
| `npm run client:create-marty` | Idempotent portal-client bootstrap             |

`next lint` was removed in Next 16 — use `npm run lint`. There is no test setup.

## Project structure

```
app/
  (app)/              Admin app shell (sidebar layout, force-dynamic)
    dashboard/        Task manager
    clients/          List, new, [id]
    invoices/         KPIs, list, new, [id]
    qr/               Saved codes, [id] detail + analytics, history
    mylar-requests/   Custom Mylar Printing inquiries, [id]
    design-requests/  Custom design requests, [id]
    client-portals/   Manage portal logins, projects & files
    settings/         Company settings
  (portal)/           Client-portal shell (force-dynamic)
    portal/           Overview, files, invoices, projects, account
  (customer)/         Self-signup shell (force-dynamic)
    onboarding/       First-run profile setup
    account/          Customer account
  tools/              Public print tools (cutline + three mockup tools)
  actions/            Server Actions: clients, invoices, settings, tasks, qr,
                      profile, auth, portal, portal-client, projects, uploads,
                      favorites, design-requests, custom-design-requests,
                      mylar-printing, mylar-requests
  api/                Route handlers: invoice PDF, file downloads, clients,
                      health, mylar artwork, design-request assets,
                      cutline + mockup generation
  q/[slug]/           Public dynamic-QR redirect
  auth/callback/      Google OAuth PKCE callback
  login/              Sign-in panel + forgot-password form
  reset-password/     Password reset flow
  page.tsx            Public link-in-bio card / sign-in screen
  layout.tsx          Root layout (dark, fonts, metadata)
  manifest.ts         PWA Web App Manifest
components/
  layout/             App shell, sidebar nav, brand, page header
  clients/            Client form
  invoices/           Invoice form, table, status badge/control
  dashboard/          Stat card, task manager
  portal/             Portal, project, and file-browser UI
  qr/                 Generator, style controls, preview, exports
  mylar-printing/     Public quote wizard steps
  mylar-requests/     Admin status badge + form
  settings/           Settings form
  shared/             Submit button, delete dialog, empty state
  ui/                 shadcn/ui primitives
lib/
  supabase/           SSR, route-handler, and service-role clients
  types/database.ts   Database types (hand-maintained schema mirror)
  auth.ts             getUser / requireAdmin / portal + customer context
  data.ts             Read queries (with safe fallbacks)
  invoice.ts          Totals + status helpers
  tasks.ts            Task labels, sorting, due-date helpers
  portal.ts           Portal category <-> storage-path mapping
  projects.ts         Project statuses + portal visibility rules
  dam.ts              File-browser helpers (version grouping, views)
  portfolio.ts        Gallery model + categorization
  qr/                 QR style, rendering, and PDF export
  cutline/            Cutline compositing, limits, presets
  mockup/             Single-bag die-cut geometry (canvas + SVG)
  mockup-generator/   8-piece sheet geometry, compositing, limits
  bag-mockup-grid/    Grid compositing, limits
  mylar-printing/     Quote wizard types, artwork rules, queries, abuse limits
  design-requests/    Custom design request schema, types, admin queries
  premade-designs.ts  Private gallery manifest + signed-URL helpers
  uploads.ts          Shared upload allowlist (extensions, size caps)
  pdf/                Invoice PDF data mapping + renderer (pdf-lib)
  email/              Resend client + HTML templates
  format.ts           Currency / date / percent formatting
proxy.ts              Session refresh + auth redirects (Next.js 16 middleware)
scripts/              One-off provisioning scripts
supabase/
  migrations/         SQL schema (0001-0025 + timestamped, applied in order)
mobile/               Separate Expo workspace (see mobile/README.md)
```

## Data model

- **clients** — company/contact info.
- **invoices** — number, client, status, dates, tax/discount rates, and
  trigger-maintained `subtotal` / `discount_amount` / `tax_amount` / `total`.
- **invoice_items** — line items (description, quantity, unit price, position).
- **payments** — payments recorded against an invoice.
- **company_settings** — single-row company profile and default tax rate.
- **tasks** — dashboard task manager (status, priority, due date, optional
  client link).
- **profiles** — self-signup customer profiles (no role column, by design).
- **client_users / client_projects / client_file_folders / client_files /
  client_file_favorites / file_activity** — the client portal.
- **qr_codes / qr_scans / qr_generations** — saved dynamic codes, append-only
  scan analytics, and generation history.
- **mylar_printing_inquiries / mylar_designs / mylar_artwork_files** — Custom
  Mylar Printing quote requests. An order is a *set* of designs, each owning its
  slice of the total quantity and its own uploaded artwork.
- **custom_design_requests / custom_design_request_files** — public custom-design
  requests and their reference uploads.

The five tables above are **the only ones with no `owner_id`**: they are filed by
anonymous visitors, so instead of owner-scoped RLS they have RLS on with **no
policies at all**, and are reachable only through the service-role client — a
validated Server Action in, a `requireAdmin()`-guarded page out. The
custom-design tables additionally `revoke all` from `anon` and `authenticated`.

Totals are computed in two places that always agree: live in the browser while
editing (`lib/invoice.ts`) and authoritatively in Postgres via triggers on save
(see migration `0001`).

## Calculations

```
subtotal        = Σ(quantity × unit_price)
discount_amount = subtotal × discount_rate / 100
tax_amount      = (subtotal − discount_amount) × tax_rate / 100
total           = subtotal − discount_amount + tax_amount
```

## Security

The app uses **Supabase Auth** (email/password and Google OAuth). Every
owner-scoped table has an `owner_id` and **Row Level Security scoped to
`auth.uid()`** (migration `0002`), so the public anon key cannot read or write
data and users only ever see their own records. Owner-scoped Server Actions and
the invoice PDF route run through the cookie-scoped client — no RLS bypass.

The exception is the five **anonymous-intake** tables (see Data model). A
visitor filing a quote or design request has no account, so there is no
`owner_id` to scope to; those tables run RLS on with **no policies at all** and
are reachable only through the server-only service-role client — a validated
Server Action writing in, a `requireAdmin()`-guarded page or route reading out.
The service role is also used for the gallery bucket listings, the
`/premadedesigns` manifest, `/qr/history`, and creating portal logins. It is
**never** imported into a Client Component and its results are never returned
unfiltered.

`proxy.ts` refreshes the session and redirects, but it is an optimistic gate
only. Real enforcement is RLS plus the `require*()` helpers in `lib/auth.ts`,
re-checked in every route group layout, page, and Server Action.

### Roles

There are four roles:

- **Admin** — email listed in the server-only `ADMIN_EMAILS` env allowlist. Gets
  the full `app/(app)` dashboard.
- **Client portal user** — a user with an active (`revoked_at is null`)
  `client_users` row mapping them to exactly one client. Confined to `/portal/*`.
- **Print-partner rep** — a user with an active `partner_users` row mapping them
  to one partner company. Confined to that company's portal (see **Print-partner
  portals**).
- **Customer** — any other authenticated user (self-signup). Lives in
  `/onboarding` until their profile is complete, then `/account/pending`.

Admin status lives **only** in env config, never in a user-writable row, so a
customer can never promote themselves — the `profiles` table deliberately has no
role column. `roleHome()` computes the right landing path and sign-in routes each
role there.

## Client Portals & secure file storage

Clients can be given a **portal login** to view only their own files and
invoices, without touching the admin app.

### What admins can do (`/client-portals`)

- Create a portal login for a client (emails a set-password link when Resend is
  configured; otherwise reveals a one-time temporary password). Provisioned
  logins must change their password on first sign-in.
- Toggle whether a client may upload files; revoke access.
- Create projects and move files into them; archive files.
- Upload files into three categories (Uploads / Final Files / Invoices),
  organize with folders, rename, and delete. Admin uploads go **directly to
  Storage** via signed upload URLs, so they are not bound by the Server Action
  body limit (25 MB/file, 20/batch).
- Preview the portal as the client sees it.

### What clients can do (`/portal`)

- See only their own client's files, projects, and **non-draft** invoices.
  Draft/archived projects and archived files are hidden at both the table and
  Storage layers.
- Download files and invoice PDFs via short-lived **signed URLs**
  (`/api/files/[fileId]`) — the bucket is private and raw object URLs are never
  exposed.
- Upload files **only** when the admin has enabled it (enforced in the server
  action *and* by Storage + table RLS).
- Browse in a Drive-style asset browser: search, sort, grid/list, thumbnails,
  preview modal, favorites, version grouping, and an activity timeline.

### Data model & RLS

- Portal tables are `owner_id`-scoped to the admin like the existing tables, with
  additive portal-scoped `SELECT` policies (via `portal_client_id()`).
- Files live in a **private `client-files` bucket**, keyed
  `{client_id}/{uploads|final-files|invoices}/…`. `storage.objects` policies
  mirror the table policies.
- Migrations `0017` and `0018` harden this: portal writes require owning the
  referenced client, and Storage reads require a portal-visible file row.

### Supabase setup

1. **Apply the migrations** (see Getting started). `0004` creates the private
   `client-files` bucket automatically.
2. **Confirm the bucket** exists and is **not public** (Storage → Buckets →
   `client-files`).
3. **Env** — creating portal logins uses the service-role key, so
   `SUPABASE_URL` and `SUPABASE_SECRET_KEY` must be set.

### Testing checklist

- As an admin, open `/client-portals`, create a login for a client, upload a file
  into each category, create a project and a folder, toggle uploads.
- In an incognito window, sign in as the portal user: you land on `/portal`;
  `/portal/files` shows only that client's files (downloads work); upload appears
  only when enabled; `/portal/invoices` lists only that client's non-draft
  invoices and the PDF downloads. `/dashboard` and `/client-portals` redirect away.
- Cross-tenant: requesting another client's `fileId` or invoice id returns 404.
- Draft/archived: a draft project and an archived file are invisible to the
  portal user, including via a direct Storage request.
- Revoke access → that user can no longer sign in to the portal.

## Print-partner portals

A private ordering portal for print companies, replacing the group chat a sales
rep used to send design jobs through. V1 serves one company, **Zaza**, at
`zazaorders.tdstudiosny.com`.

### What a rep can do

Sign in, file a design job (a job name, one or more products with a finish and a
quantity, reference files, and notes), and watch its status — **New → In Progress
→ Completed**. That's the whole surface: no messaging, quoting, invoicing,
approvals or revisions.

### What TD Studios can do

`/partner-jobs` lists every job from every partner; `/partner-jobs/[id]` shows
the full submission and is the **only** place a status changes.

### Hostname routing

One set of routes, three ways in — all resolved in
`lib/partner-jobs/routing.ts` and applied by `proxy.ts`:

| Reached by | Example | Rewritten to |
| --- | --- | --- |
| subdomain | `zazaorders.tdstudiosny.com/jobs` | `/partner/zaza/jobs` |
| path alias | `tdstudiosny.com/zaza-orders/jobs` | `/partner/zaza/jobs` |
| internal path | `tdstudiosny.com/partner/zaza/jobs` | (no rewrite) |

Matching is on the leftmost hostname label, so `zazaorders.localhost:3000` works
in development with no hosts-file entry. Every other host and path resolves to
`null` and is left completely alone.

### Adding another print company

1. Insert a `partner_companies` row (`name`, `slug`, a unique 2–6 letter
   `job_prefix`).
2. Add one entry to `PARTNER_SUBDOMAINS` in `lib/partner-jobs/routing.ts`
   (and optionally one to `PARTNER_PATH_ALIASES`).
3. Add the domain in Vercel.

No new route folder — `app/(partner)/partner/[slug]` serves every company.

### Giving a sales rep access

There is no self-signup. Create the auth user, then map them to the company:

1. Supabase dashboard → **Authentication → Users → Add user**, check
   *Auto Confirm*, and set a password to hand over.
2. SQL Editor:

   ```sql
   insert into public.partner_users (user_id, company_id, display_name)
   select u.id, c.id, 'Rep name'
     from auth.users u, public.partner_companies c
    where u.email = 'rep@printcompany.com'
      and c.slug = 'zaza';
   ```

3. They sign in at `zazaorders.tdstudiosny.com/login`.

Revoke with `update public.partner_users set active = false where user_id = …`;
pause a whole company with `partner_companies.active = false`. Both take effect
on the rep's next request, because `partner_company_id()` — the function every
policy is built on — checks both flags.

### Security model

| | Partner rep | TD Studios admin |
| --- | --- | --- |
| See their own company's jobs | ✅ | ✅ (all companies) |
| See another company's jobs | ❌ RLS | ✅ |
| File a job | ✅ (own company only) | — |
| Change job status | ❌ **no UPDATE policy exists** | ✅ |
| Delete a job | ❌ no DELETE policy exists | — |
| Download job files | ✅ own company only | ✅ |
| Join / move company | ❌ no INSERT or UPDATE policy on `partner_users` | via service role |

Enforcement is Postgres RLS, not application code: reps read and write through
the cookie-scoped client, so every query is re-checked by the policies in
`supabase/migrations/20260825120000_partner_job_portal.sql`. Admin access runs
through the service-role client behind `requireAdmin()`, because partner tables
have no `owner_id` to scope an admin policy to.

Job files live in the private `partner-job-files` bucket, keyed
`{companyId}/{jobId}/{uuid}-{name}`. The bucket's own storage policies pin the
first path segment to the caller's company, so Storage refuses a cross-company
write independently of the app. Bytes are never served by raw object URL —
`/api/partner-job-files/[fileId]` authorizes the request and 302s to a
60-second signed URL.

Job numbers (`ZA-1001`, `ZA-1002`, …) come from a per-company counter incremented
inside a `BEFORE INSERT` trigger; the `update … returning` row lock serializes
concurrent submissions, and `job_number` is `UNIQUE` as a second line of defence.

### Testing checklist

- Signed out, `zazaorders.tdstudiosny.com/jobs` → the portal login, not the main site's
- A rep signs in → their job list; the main site's `/dashboard` stays out of reach
- File a job with **several products** and **several files** → lands on its detail page with a `ZA-####` number
- A rep of another company cannot open that job's URL (404) or its files
- A customer or client-portal user signing in at the partner login is refused
- `/partner-jobs` lists it; changing the status there shows up on the rep's page
- `tdstudiosny.com` and `www.tdstudiosny.com` behave exactly as before

## Email (Resend)

Transactional email is sent via [Resend](https://resend.com) for four flows:

- **Email an invoice** — the "Email to client" button sends the client the PDF
  and marks a `draft` invoice as `sent` (`sendInvoiceAction`).
- **Portal invites** — creating a portal login emails a set-password link
  (`createPortalUserAction`).
- **Mylar printing inquiries** — a new quote request notifies the `ADMIN_EMAILS`
  addresses.
- **Custom design requests** — a new request notifies the same addresses, with
  30-day signed links to any reference files.

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
invoice-email button reports email isn't configured, portal invites fall back to
a one-time temp password, and mylar inquiries and design requests are still
stored (just not emailed). Both env vars are **server-only** (never `NEXT_PUBLIC_`).

## Install as an app (PWA)

The app ships a Web App Manifest (`app/manifest.ts`) and maskable icons, so it's
installable from a supported browser ("Add to Home Screen" / install icon). It
launches standalone to `/dashboard`.

## Mobile companion app

`mobile/` is a **separate, self-contained Expo workspace** — not part of the
Next.js build, with its own `node_modules` and scripts. It connects to the same
Supabase project with the anon key and existing RLS only. See
`mobile/README.md` to run it.

## Deploy to Vercel

### Deployment checklist

1. **Database** — apply migrations to your Supabase project **in order** via the
   SQL Editor, or `supabase db push` if linked. Verify the private
   `client-files`, `design-requests`, `mylar-artwork`, and `partner-job-files`
   buckets were created,
   and create the gallery buckets by hand (see Getting started). `owner_id` +
   owner-scoped policies apply to every table except the five anonymous-intake
   tables, which have RLS on with no policies (see Data model).
2. **Create an admin user** — Supabase dashboard → Authentication → Users → Add
   user (check *Auto Confirm*), then add that email to `ADMIN_EMAILS`. Customers
   can self-serve at `/sign-up`; admins cannot.
3. **Google OAuth (optional)** — enable the Google provider in Supabase and add
   `https://your-domain/auth/callback` to its Redirect URLs allowlist.
4. **Environment variables** — set these in the Vercel project (Production +
   Preview):

   | Variable | Required | Notes |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | SSR client |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | SSR client (public) |
   | `ADMIN_EMAILS` | ✅ | Admin allowlist — **empty means no admin access** |
   | `SUPABASE_URL` | ✅ | API route handlers + service-role client |
   | `SUPABASE_PUBLISHABLE_KEY` | ✅ | API route handlers |
   | `SUPABASE_SECRET_KEY` | ✅ | **server-only**, never expose |
   | `SUPABASE_JWKS_URL` | ✅ | JWT verification |
   | `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | optional | email; degrades gracefully |
   | `NEXT_PUBLIC_SITE_URL` | optional | custom domain; otherwise `VERCEL_URL` is used |
   | `QR_SCAN_SALT` | optional | salts hashed IPs; a default is used when unset |
   | `PREMADE_GALLERY_COOKIE_SECRET` | optional | signs the `/premadedesigns` keypad cookie; falls back to `SUPABASE_SECRET_KEY` |

5. **Partner subdomains (optional)** — to serve a print partner's portal on its
   own hostname, add the domain to this same Vercel project (Project → Settings →
   Domains → Add, e.g. `zazaorders.tdstudiosny.com`) and point the DNS record
   Vercel shows at it. No separate project, no `vercel.json`, and no code change
   for the domain itself — `proxy.ts` maps the subdomain label to a partner slug
   through `PARTNER_SUBDOMAINS` in `lib/partner-jobs/routing.ts`.
6. **Build settings** — defaults work: build `next build`, output auto-detected,
   Node.js 20+. No `vercel.json` needed.
7. **Deploy**, then smoke-test:
   - `/login` loads and authenticates → an admin lands on `/dashboard`
   - create a client/invoice; confirm it's scoped to your user
   - **Download PDF** on an invoice returns `TD-INV-####.pdf`
   - a public tool (e.g. `/tools/cutline-generator`) loads and exports
   - sign out → returns to `/login`; visiting `/dashboard` redirects to `/login`

> Tip: keep `SUPABASE_SECRET_KEY` out of any `NEXT_PUBLIC_*` variable — only the
> anon key is safe to expose to the browser.

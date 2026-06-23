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
- **Mobile responsive** — collapsible sidebar with a sheet-based mobile nav.

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
| `/settings`       | Company settings                         |

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
  (app)/              App shell (sidebar layout, force-dynamic)
    dashboard/        KPIs + recent invoices
    clients/          List, new, [id]
    invoices/         List, new, [id]
    settings/         Company settings
  actions/            Server Actions (clients, invoices, settings)
  page.tsx            Landing page
  layout.tsx          Root layout (dark, fonts, metadata)
components/
  layout/             App shell, sidebar nav, brand, page header
  clients/            Client form
  invoices/           Invoice form, table, status badge/control
  settings/           Settings form
  dashboard/          Stat card
  shared/             Submit button, delete dialog, empty state
  ui/                 shadcn/ui primitives
lib/
  supabase/           Server + browser Supabase clients
  types/database.ts   Database types
  data.ts             Read queries (with safe fallbacks)
  invoice.ts          Totals + status helpers
  format.ts           Currency / date / percent formatting
supabase/
  migrations/         SQL schema
```

## Data model

- **clients** — company/contact info.
- **invoices** — number, client, status, dates, tax/discount rates, and
  trigger-maintained `subtotal` / `discount_amount` / `tax_amount` / `total`.
- **invoice_items** — line items (description, quantity, unit price, position).
- **payments** — payments recorded against an invoice.
- **company_settings** — single-row company profile and default tax rate.

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

## Security note

This app currently ships **without authentication**. Row Level Security is
enabled with permissive policies so the anon key works out of the box. Before
going live with real data, add authentication and scope the RLS policies to the
authenticated user (see the `TODO(auth)` note at the top of the migration).

## Roadmap (not yet implemented)

Stubbed with `TODO` comments in the codebase:

- **Stripe** — collect payments and reconcile them against invoices
  (`app/actions/invoices.ts`, `.env.example`).
- **Resend** — email invoices to clients and flip status to "Sent"
  (`app/actions/invoices.ts`, `.env.example`).

## Deploy

Deploys to [Vercel](https://vercel.com) with zero config. Add the
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment
variables in your Vercel project settings.

-- TD Studios Invoice App — initial schema
-- Tables: clients, invoices, invoice_items, payments, company_settings
--
-- Note on security: this app currently ships without authentication, so Row Level
-- Security is enabled with permissive policies for the anon/authenticated roles.
-- TODO(auth): when authentication is added, scope every policy to auth.uid()
-- and add an `owner_id uuid references auth.users` column to each table.

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_settings (single-row configuration)
-- ---------------------------------------------------------------------------
create table if not exists public.company_settings (
  id                   uuid primary key default gen_random_uuid(),
  company_name         text not null default 'TD Studios',
  address              text,
  email                text,
  phone                text,
  tax_rate             numeric(6, 3) not null default 0,
  payment_instructions text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger company_settings_set_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

-- Seed a default settings row so the Settings page always has something to edit.
insert into public.company_settings (company_name, tax_rate)
select 'TD Studios', 0
where not exists (select 1 from public.company_settings);

-- ---------------------------------------------------------------------------
-- Invoice numbering: TD-INV-0001, TD-INV-0002, ...
-- ---------------------------------------------------------------------------
create sequence if not exists public.invoice_number_seq start with 1;

create or replace function public.next_invoice_number()
returns text
language sql
as $$
  select 'TD-INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
$$;

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue');

create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text not null unique default public.next_invoice_number(),
  client_id       uuid references public.clients (id) on delete set null,
  status          public.invoice_status not null default 'draft',
  issue_date      date not null default current_date,
  due_date        date,
  tax_rate        numeric(6, 3) not null default 0,   -- percentage, e.g. 8.875
  discount_rate   numeric(6, 3) not null default 0,   -- percentage
  notes           text,
  -- Derived totals, maintained by triggers below.
  subtotal        numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  tax_amount      numeric(12, 2) not null default 0,
  total           numeric(12, 2) not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_status_idx on public.invoices (status);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- invoice_items
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null default '',
  quantity    numeric(12, 2) not null default 1,
  unit_price  numeric(12, 2) not null default 0,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  amount       numeric(12, 2) not null default 0,
  payment_date date not null default current_date,
  method       text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists payments_invoice_id_idx on public.payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Totals calculation
--   subtotal        = Σ(quantity * unit_price)
--   discount_amount = subtotal * discount_rate / 100
--   tax_amount      = (subtotal - discount_amount) * tax_rate / 100
--   total           = subtotal - discount_amount + tax_amount
-- ---------------------------------------------------------------------------
create or replace function public.recalc_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
as $$
declare
  v_subtotal numeric(12, 2);
  v_discount numeric(12, 2);
  v_tax      numeric(12, 2);
  v_tax_rate numeric(6, 3);
  v_disc_rate numeric(6, 3);
begin
  select coalesce(sum(quantity * unit_price), 0)
    into v_subtotal
    from public.invoice_items
   where invoice_id = p_invoice_id;

  select tax_rate, discount_rate
    into v_tax_rate, v_disc_rate
    from public.invoices
   where id = p_invoice_id;

  v_discount := round(v_subtotal * coalesce(v_disc_rate, 0) / 100, 2);
  v_tax := round((v_subtotal - v_discount) * coalesce(v_tax_rate, 0) / 100, 2);

  update public.invoices
     set subtotal = v_subtotal,
         discount_amount = v_discount,
         tax_amount = v_tax,
         total = v_subtotal - v_discount + v_tax
   where id = p_invoice_id;
end;
$$;

-- Recalculate when items change.
create or replace function public.invoice_items_recalc()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.recalc_invoice_totals(old.invoice_id);
    return old;
  end if;
  perform public.recalc_invoice_totals(new.invoice_id);
  return new;
end;
$$;

create trigger invoice_items_recalc_totals
  after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_recalc();

-- Recalculate when an invoice's rates change.
create or replace function public.invoices_recalc_on_rate_change()
returns trigger
language plpgsql
as $$
begin
  if (new.tax_rate is distinct from old.tax_rate)
     or (new.discount_rate is distinct from old.discount_rate) then
    perform public.recalc_invoice_totals(new.id);
  end if;
  return new;
end;
$$;

create trigger invoices_recalc_on_rate_change
  after update on public.invoices
  for each row execute function public.invoices_recalc_on_rate_change();

-- ---------------------------------------------------------------------------
-- Row Level Security (permissive until auth is added — see note at top)
-- ---------------------------------------------------------------------------
alter table public.clients          enable row level security;
alter table public.invoices         enable row level security;
alter table public.invoice_items    enable row level security;
alter table public.payments         enable row level security;
alter table public.company_settings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'invoices', 'invoice_items', 'payments', 'company_settings']
  loop
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true);',
      t || '_all_access', t
    );
  end loop;
end;
$$;

-- TD Studios Invoice App — client portals & secure file storage
--
-- Adds a second role to the app: "client portal users". An admin (any existing
-- authenticated user — see is_portal_user() below) can give a client a login that
-- only ever sees that one client's invoices and files. This migration is purely
-- ADDITIVE to the owner-scoped model from 0002:
--
--   * New tables (client_users, client_file_folders, client_files, file_activity)
--     are owner-scoped exactly like the existing tables (owner_id = the admin).
--   * Existing tables gain EXTRA permissive SELECT policies so a portal user can
--     read the rows linked to their assigned client. The existing owner policies
--     are untouched, so admin behavior is identical.
--   * The existing write policies are tightened to exclude portal users, so a
--     portal login can never write to clients/invoices/etc. (pure hardening).
--
-- Storage bucket + storage.objects policies live in 0004_client_files_storage.sql.

-- ---------------------------------------------------------------------------
-- Category enum — maps a file to one of the three storage prefixes:
--   uploads/  final-files/  invoices/   (see 0004 for the path convention)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'file_category') then
    create type public.file_category as enum ('uploads', 'final_files', 'invoices');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- client_users — maps a Supabase auth user to a single client (their portal).
-- A user is a "portal user" iff they have a row here with revoked_at is null.
-- ---------------------------------------------------------------------------
create table if not exists public.client_users (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  email       text,
  can_upload  boolean not null default false,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_users_owner_id_idx  on public.client_users (owner_id);
create index if not exists client_users_user_id_idx   on public.client_users (user_id);
create index if not exists client_users_client_id_idx on public.client_users (client_id);

create trigger client_users_set_updated_at
  before update on public.client_users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_file_folders — optional organizational folders within a category.
-- Folders are metadata only (renaming a folder does NOT move storage objects);
-- the storage path is derived from category, not the folder tree.
-- ---------------------------------------------------------------------------
create table if not exists public.client_file_folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  category    public.file_category not null default 'uploads',
  name        text not null,
  parent_id   uuid references public.client_file_folders (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_file_folders_owner_id_idx  on public.client_file_folders (owner_id);
create index if not exists client_file_folders_client_id_idx on public.client_file_folders (client_id);

create trigger client_file_folders_set_updated_at
  before update on public.client_file_folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_files — metadata for an object stored in the private client-files bucket.
-- ---------------------------------------------------------------------------
create table if not exists public.client_files (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users (id) on delete cascade default auth.uid(),
  client_id     uuid not null references public.clients (id) on delete cascade,
  folder_id     uuid references public.client_file_folders (id) on delete set null,
  category      public.file_category not null default 'uploads',
  storage_path  text not null unique,
  name          text not null,
  size_bytes    bigint not null default 0,
  mime_type     text,
  uploaded_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists client_files_owner_id_idx  on public.client_files (owner_id);
create index if not exists client_files_client_id_idx on public.client_files (client_id);
create index if not exists client_files_folder_id_idx on public.client_files (folder_id);

-- ---------------------------------------------------------------------------
-- file_activity — audit log of portal/file actions (upload, download, delete…).
-- ---------------------------------------------------------------------------
create table if not exists public.file_activity (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  file_id     uuid references public.client_files (id) on delete set null,
  actor_id    uuid references auth.users (id) on delete set null default auth.uid(),
  action      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists file_activity_owner_id_idx  on public.file_activity (owner_id);
create index if not exists file_activity_client_id_idx on public.file_activity (client_id);

-- ---------------------------------------------------------------------------
-- Helper functions. SECURITY DEFINER so the policies below can read client_users
-- without recursing through its own RLS. `set search_path = public` is required
-- for definer functions (security hardening).
-- ---------------------------------------------------------------------------
create or replace function public.portal_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id
    from public.client_users
   where user_id = auth.uid()
     and revoked_at is null
   limit 1;
$$;

create or replace function public.is_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_users
     where user_id = auth.uid() and revoked_at is null
  );
$$;

create or replace function public.portal_can_upload()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select can_upload from public.client_users
      where user_id = auth.uid() and revoked_at is null
      limit 1),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — new tables
-- ---------------------------------------------------------------------------
alter table public.client_users        enable row level security;
alter table public.client_file_folders enable row level security;
alter table public.client_files        enable row level security;
alter table public.file_activity       enable row level security;

-- client_users: admins manage their own mappings; a portal user may read its own.
create policy client_users_admin_all on public.client_users
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy client_users_select_self on public.client_users
  for select to authenticated
  using (user_id = auth.uid());

-- client_file_folders: admin full CRUD; portal user reads its client's folders.
create policy client_file_folders_admin_all on public.client_file_folders
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy client_file_folders_portal_select on public.client_file_folders
  for select to authenticated
  using (client_id = public.portal_client_id());

-- client_files: admin full CRUD; portal reads its client's files and may INSERT
-- only into the uploads category for its own client when uploading is enabled.
create policy client_files_admin_all on public.client_files
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy client_files_portal_select on public.client_files
  for select to authenticated
  using (client_id = public.portal_client_id());
create policy client_files_portal_insert on public.client_files
  for insert to authenticated
  with check (
    client_id = public.portal_client_id()
    and category = 'uploads'
    and public.portal_can_upload()
  );

-- file_activity: admins read their own log; any authenticated user may append a
-- row attributed to themselves (writes happen in server actions/route handlers).
create policy file_activity_admin_select on public.file_activity
  for select to authenticated
  using (owner_id = auth.uid());
create policy file_activity_insert_self on public.file_activity
  for insert to authenticated
  with check (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS — extend existing tables with ADDITIVE portal SELECT policies.
-- These are OR'd with the existing owner_id policies from 0002, so admins are
-- unaffected. Portal users may read only the rows tied to their assigned client
-- (and never draft invoices).
-- ---------------------------------------------------------------------------
create policy clients_portal_select on public.clients
  for select to authenticated
  using (id = public.portal_client_id());

create policy invoices_portal_select on public.invoices
  for select to authenticated
  using (
    client_id = public.portal_client_id()
    and status <> 'draft'
  );

create policy invoice_items_portal_select on public.invoice_items
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
       where i.id = invoice_items.invoice_id
         and i.client_id = public.portal_client_id()
         and i.status <> 'draft'
    )
  );

create policy payments_portal_select on public.payments
  for select to authenticated
  using (
    exists (
      select 1 from public.invoices i
       where i.id = payments.invoice_id
         and i.client_id = public.portal_client_id()
         and i.status <> 'draft'
    )
  );

-- ---------------------------------------------------------------------------
-- RLS — tighten existing write policies so portal users cannot write to the core
-- tables via their own auth.uid(). Admins have is_portal_user() = false, so this
-- changes nothing for them. We drop the 0002 write policies and recreate them
-- with the extra guard (SELECT policies from 0002 are left as-is).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'invoices', 'invoice_items', 'payments', 'company_settings']
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid() and not public.is_portal_user());',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = auth.uid() and not public.is_portal_user()) with check (owner_id = auth.uid() and not public.is_portal_user());',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid() and not public.is_portal_user());',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

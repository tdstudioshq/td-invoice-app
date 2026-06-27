-- TD Studios Invoice App — customer self-signup profiles
--
-- Self-service customer accounts. The app has three roles:
--   * admin   — email is in the server-side ADMIN_EMAILS allowlist (NOT stored
--               here, never user-writable). Full /dashboard access.
--   * portal  — has an un-revoked public.client_users row (existing flow).
--   * customer— any other authenticated user. This table holds their profile.
--
-- SECURITY — no self-promotion by construction: there is deliberately NO role /
-- is_admin column on this table. Admin status lives only in server config, so a
-- customer can never escalate by writing to their own row. Owner-only RLS lets a
-- user read/create/update ONLY their own profile. Admins read/manage profiles
-- through the service-role client (lib/supabase/admin.ts), which bypasses RLS —
-- the same sanctioned pattern used for portal-user creation; no admin SQL policy
-- (and therefore no admin identity) is needed in the database.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  email         text,
  phone         text,
  instagram     text,
  business_name text,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

-- A user can read only their own profile.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- A user can create only their own profile row (id must be their own uid).
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

-- A user can update only their own profile. There is no admin/role column, so
-- there is nothing here a user could write to grant themselves admin access.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- TD Studios Invoice App — authentication & per-user data scoping
--
-- This migration converts the app from a single-tenant, publicly-writable
-- database into a multi-tenant one scoped to authenticated Supabase users.
--
-- It:
--   1. Adds `owner_id uuid` (FK -> auth.users) to every data table, defaulting
--      to auth.uid() so rows created by a signed-in user are auto-attributed.
--   2. Replaces the permissive "anon/authenticated can do anything" policies
--      from 0001 with policies that scope every row to its owner and remove the
--      `anon` role entirely.
--
-- See the README "Authentication" section and the migration summary for the
-- manual dashboard steps (creating users, backfilling existing rows).

-- ---------------------------------------------------------------------------
-- 1. owner_id columns
--    Nullable on purpose: the secret-key API routes (app/api/*) run as the
--    service role with no auth.uid(), so a NOT NULL default would break them.
--    RLS (below) still hides any row whose owner_id <> auth.uid(), so a null
--    owner is simply invisible to end users.
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

alter table public.invoices
  add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

alter table public.invoice_items
  add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

alter table public.payments
  add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

alter table public.company_settings
  add column if not exists owner_id uuid
  references auth.users (id) on delete cascade default auth.uid();

-- Index owner_id everywhere — every RLS check and query filters on it.
create index if not exists clients_owner_id_idx          on public.clients (owner_id);
create index if not exists invoices_owner_id_idx         on public.invoices (owner_id);
create index if not exists invoice_items_owner_id_idx    on public.invoice_items (owner_id);
create index if not exists payments_owner_id_idx         on public.payments (owner_id);
create index if not exists company_settings_owner_id_idx on public.company_settings (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Replace permissive policies with owner-scoped ones
--    RLS is already enabled on all tables (see 0001). We only swap policies.
--    Every policy targets `authenticated` only — `anon` loses all access, which
--    is the core security fix (the public anon key can no longer read/write).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'invoices', 'invoice_items', 'payments', 'company_settings']
  loop
    -- Drop the old permissive "<table>_all_access" policy from 0001.
    execute format('drop policy if exists %I on public.%I;', t || '_all_access', t);

    -- Read your own rows.
    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = auth.uid());',
      t || '_select_own', t
    );
    -- Create rows you own (owner_id defaults to auth.uid() but is also checked).
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = auth.uid());',
      t || '_insert_own', t
    );
    -- Update only your own rows, and you cannot reassign ownership away.
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t || '_update_own', t
    );
    -- Delete only your own rows.
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = auth.uid());',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill (MANUAL — uncomment and set the UUID)
--    Rows created before this migration have a null owner_id and are therefore
--    invisible to everyone. To adopt existing data, assign it to a user. Find
--    the UUID in the Supabase dashboard (Authentication -> Users).
-- ---------------------------------------------------------------------------
-- update public.clients          set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;
-- update public.invoices         set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;
-- update public.invoice_items    set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;
-- update public.payments         set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;
-- update public.company_settings set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;

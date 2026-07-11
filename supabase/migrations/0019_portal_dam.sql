-- TD Studios Invoice App — portal digital-asset-management layer
--
-- Adds the two data pieces the Drive-style portal file browser needs:
--
--   1. client_file_favorites — per-USER starred files (a portal login and an
--      admin can each keep their own stars on the same file). RLS lets a user
--      manage only their own rows, and only for files they can already see
--      (admin owns the client, or the file belongs to their portal client).
--
--   2. A portal SELECT policy on file_activity. 0003 gave admins their own
--      log but portal users none; the portal Activity timeline needs to read
--      the rows for their assigned client.
--
-- Apply after 0018.

-- ---------------------------------------------------------------------------
-- 1. Favorites
-- ---------------------------------------------------------------------------

create table if not exists public.client_file_favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  file_id    uuid not null references public.client_files (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, file_id)
);

create index if not exists client_file_favorites_user_idx
  on public.client_file_favorites (user_id);
create index if not exists client_file_favorites_file_idx
  on public.client_file_favorites (file_id);

alter table public.client_file_favorites enable row level security;

-- A user sees and manages only their own stars, and may only star a file they
-- can legitimately access: they own the client (admin) or it is their portal
-- client. The file/client pairing is also pinned so a row can't smuggle a
-- mismatched client_id past the check.
create policy client_file_favorites_own on public.client_file_favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.client_files f
       where f.id = client_file_favorites.file_id
         and f.client_id = client_file_favorites.client_id
    )
    and (
      exists (
        select 1 from public.clients c
         where c.id = client_file_favorites.client_id
           and c.owner_id = auth.uid()
      )
      or client_file_favorites.client_id = public.portal_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Portal read access to the activity log
-- ---------------------------------------------------------------------------

drop policy if exists file_activity_portal_select on public.file_activity;
create policy file_activity_portal_select on public.file_activity
  for select to authenticated
  using (client_id = public.portal_client_id());

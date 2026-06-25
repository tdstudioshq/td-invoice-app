-- TD Studios Invoice App — Instagram leads
--
-- Stores imported Instagram follower/following records in the admin workspace.
-- Leads are owner-scoped and are never visible to client-portal users.

create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  instagram_id      text not null,
  username          text not null,
  full_name         text,
  is_private        boolean not null default false,
  is_verified       boolean not null default false,
  profile_pic_url   text,
  relationship_type text not null
    check (relationship_type in ('followers', 'following')),
  source_username   text not null,
  source_file       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (owner_id, source_username, instagram_id)
);

create index if not exists leads_owner_id_idx
  on public.leads (owner_id);

create index if not exists leads_owner_username_idx
  on public.leads (owner_id, username);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

alter table public.leads enable row level security;

create policy leads_select_own on public.leads
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy leads_insert_own on public.leads
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy leads_update_own on public.leads
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy leads_delete_own on public.leads
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

-- TD Studios Invoice App — Bio Pages (link-in-bio builder)
--
-- A "link in bio" feature: any authenticated user (admin or customer) can build
-- a public page at /u/<username> listing their links. It is fully self-service
-- and owner-scoped, following the same security model as qr_codes (0007/0008):
--
--   * Owners read/write ONLY their own bio_pages + bio_links via owner-scoped RLS.
--   * The public /u/<username> page does NOT read these tables directly. It calls
--     the SECURITY DEFINER helpers get_bio_page()/get_bio_links(), which expose
--     ONLY published pages and their visible links — never owner_id or drafts.
--   * Anonymous visitors get EXECUTE on those helpers (and the view logger) only;
--     they have no table grant and can never read drafts or write anything.
--
-- No role/admin column lives here, so this is unrelated to the admin allowlist —
-- a bio page never grants any privilege (mirrors the profiles table reasoning).

-- ---------------------------------------------------------------------------
-- bio_pages — one published profile per username.
-- ---------------------------------------------------------------------------
create table if not exists public.bio_pages (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  -- Stored lowercased; the app normalizes before writing. The pattern mirrors
  -- the client-side validation (lowercase letters/numbers/hyphen/underscore).
  username      text not null unique
    check (username ~ '^[a-z0-9_-]{3,30}$'),
  display_name  text,
  bio           text,
  -- Public-bucket object key {owner_id}/avatar/{file}; null → initials fallback.
  avatar_path   text,
  theme         text not null default 'glass'
    check (theme in ('minimal', 'dark', 'gradient', 'glass')),
  accent_color  text not null default '#4F8CFF'
    check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Defense-in-depth: reserved route prefixes can never be claimed as usernames,
  -- even if the app-level check is bypassed. Keep in sync with lib/bio.ts.
  constraint bio_pages_username_not_reserved check (
    username not in (
      'admin', 'dashboard', 'login', 'sign-up', 'account', 'portal', 'qr',
      'invoices', 'clients', 'api', 'u', 'q', 'settings', 'leads', 'onboarding',
      'reset-password', 'link-builder', 'qr-generator', 'client-portals'
    )
  )
);

create index if not exists bio_pages_owner_id_idx on public.bio_pages (owner_id);
create index if not exists bio_pages_username_published_idx
  on public.bio_pages (username) where is_published;

create trigger bio_pages_set_updated_at
  before update on public.bio_pages
  for each row execute function public.set_updated_at();

alter table public.bio_pages enable row level security;

create policy bio_pages_select_own on public.bio_pages
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy bio_pages_insert_own on public.bio_pages
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy bio_pages_update_own on public.bio_pages
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy bio_pages_delete_own on public.bio_pages
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- bio_links — ordered links on a bio page. Carries owner_id (like invoice_items)
-- so RLS is a simple owner check; inserts must also target a page they own.
-- ---------------------------------------------------------------------------
create table if not exists public.bio_links (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  bio_page_id  uuid not null
    references public.bio_pages (id) on delete cascade,
  title        text not null,
  url          text not null,
  icon         text,
  sort_order   integer not null default 0,
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists bio_links_page_order_idx
  on public.bio_links (bio_page_id, sort_order);
create index if not exists bio_links_owner_id_idx on public.bio_links (owner_id);

create trigger bio_links_set_updated_at
  before update on public.bio_links
  for each row execute function public.set_updated_at();

alter table public.bio_links enable row level security;

create policy bio_links_select_own on public.bio_links
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- Insert: must own the row AND own the parent page it attaches to.
create policy bio_links_insert_own on public.bio_links
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.bio_pages p
      where p.id = bio_links.bio_page_id and p.owner_id = (select auth.uid())
    )
  );

create policy bio_links_update_own on public.bio_links
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy bio_links_delete_own on public.bio_links
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- bio_page_views — append-only view analytics (parallels qr_scans). Owner-read
-- only; inserts happen exclusively through the SECURITY DEFINER logger below.
-- ---------------------------------------------------------------------------
create table if not exists public.bio_page_views (
  id           uuid primary key default gen_random_uuid(),
  bio_page_id  uuid not null
    references public.bio_pages (id) on delete cascade,
  viewed_at    timestamptz not null default now(),
  referrer     text,
  user_agent   text
);

create index if not exists bio_page_views_page_id_idx
  on public.bio_page_views (bio_page_id);
create index if not exists bio_page_views_page_id_viewed_at_idx
  on public.bio_page_views (bio_page_id, viewed_at desc);

alter table public.bio_page_views enable row level security;

create policy bio_page_views_select_own on public.bio_page_views
  for select to authenticated
  using (
    exists (
      select 1 from public.bio_pages p
      where p.id = bio_page_views.bio_page_id
        and p.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Public, SECURITY DEFINER read helpers. The /u/<username> page calls these so
-- an anonymous visitor can render a PUBLISHED page + its VISIBLE links without
-- any table grant. Drafts, hidden links, and owner_id are never exposed.
-- ---------------------------------------------------------------------------
create or replace function public.get_bio_page(p_username text)
returns table (
  id            uuid,
  username      text,
  display_name  text,
  bio           text,
  avatar_path   text,
  theme         text,
  accent_color  text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, username, display_name, bio, avatar_path, theme, accent_color
  from public.bio_pages
  where username = lower(p_username)
    and is_published
  limit 1;
$$;

revoke all on function public.get_bio_page(text) from public;
grant execute on function public.get_bio_page(text) to anon, authenticated;

create or replace function public.get_bio_links(p_page_id uuid)
returns table (
  id          uuid,
  title       text,
  url         text,
  icon        text,
  sort_order  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.title, l.url, l.icon, l.sort_order
  from public.bio_links l
  join public.bio_pages p on p.id = l.bio_page_id
  where l.bio_page_id = p_page_id
    and l.is_visible
    and p.is_published
  order by l.sort_order asc, l.created_at asc;
$$;

revoke all on function public.get_bio_links(uuid) from public;
grant execute on function public.get_bio_links(uuid) to anon, authenticated;

-- Append-only view logger. SECURITY DEFINER so anon can record a view with no
-- table grant; guarded by an EXISTS on a PUBLISHED page so views can't be forged
-- for drafts or non-existent pages. Best-effort, side-effect-only.
create or replace function public.log_bio_page_view(
  p_page_id    uuid,
  p_referrer   text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bio_page_views (bio_page_id, referrer, user_agent)
  select p_page_id, p_referrer, p_user_agent
  where exists (
    select 1 from public.bio_pages p
    where p.id = p_page_id and p.is_published
  );
end;
$$;

revoke all on function public.log_bio_page_view(uuid, text, text) from public;
grant execute on function public.log_bio_page_view(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public Storage bucket for avatars. Object key: {owner_id}/avatar/{file}.
-- Public read (avatars are shown on the public page); writes are owner-scoped to
-- the user's own {owner_id}/ prefix. No service-role needed.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bio-page-assets', 'bio-page-assets', true)
on conflict (id) do nothing;

create policy "bio_assets_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bio-page-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "bio_assets_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'bio-page-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'bio-page-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "bio_assets_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'bio-page-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- TD Studios Invoice App — saved QR codes & dynamic redirect links
--
-- Owner-scoped saved QR codes. Each dynamic code exposes a short public link
-- (/q/<slug>) that redirects to its destination, so the printed code can be
-- repointed without regenerating it.
--
-- The table stays fully private (owner-only RLS, never visible to portal users).
-- The public redirect route does NOT read the table directly: it resolves a slug
-- through the SECURITY DEFINER helper public.resolve_qr_slug(), which returns
-- ONLY the destination URL for an active dynamic code — never owner_id, name, or
-- any other column. This is the minimum surface needed for an anonymous lookup.

create table if not exists public.qr_codes (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  name            text not null,
  slug            text not null unique,
  type            text not null default 'url'
    check (type in ('url', 'text')),
  destination_url text,
  raw_value       text not null,
  style_json      jsonb not null default '{}'::jsonb,
  is_dynamic      boolean not null default true,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists qr_codes_owner_id_idx
  on public.qr_codes (owner_id);

-- Supports the public active-slug lookup performed by the resolver.
create index if not exists qr_codes_slug_active_idx
  on public.qr_codes (slug) where is_active;

create trigger qr_codes_set_updated_at
  before update on public.qr_codes
  for each row execute function public.set_updated_at();

alter table public.qr_codes enable row level security;

create policy qr_codes_select_own on public.qr_codes
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy qr_codes_insert_own on public.qr_codes
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy qr_codes_update_own on public.qr_codes
  for update to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy qr_codes_delete_own on public.qr_codes
  for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

-- Public slug resolver. SECURITY DEFINER so the anonymous /q/<slug> redirect can
-- resolve a destination without any table-level read grant to anon. Returns only
-- the redirect target for an active dynamic URL code, and nothing for missing or
-- inactive slugs. STABLE: it performs no writes.
create or replace function public.resolve_qr_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select destination_url
  from public.qr_codes
  where slug = p_slug
    and is_active
    and is_dynamic
    and type = 'url'
    and destination_url is not null
  limit 1;
$$;

revoke all on function public.resolve_qr_slug(text) from public;
grant execute on function public.resolve_qr_slug(text) to anon, authenticated;

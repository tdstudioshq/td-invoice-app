-- TD Studios Invoice App — QR scan analytics
--
-- Append-only scan events for dynamic QR codes, plus the public logging path and
-- a richer slug resolver used by the /q/<slug> redirect.
--
-- Privacy: we store a salted IP HASH (never the raw IP), a coarse device class,
-- and an optional country — enough for simple aggregate analytics, nothing that
-- identifies a visitor. Scans are owner-readable only (through the parent code);
-- there is no public read. Inserts happen exclusively through the SECURITY
-- DEFINER log_qr_scan() function, so anonymous callers can record a scan without
-- any table grant and cannot read scans or forge them for codes that don't exist.

create table if not exists public.qr_scans (
  id          uuid primary key default gen_random_uuid(),
  qr_code_id  uuid not null
    references public.qr_codes (id) on delete cascade,
  scanned_at  timestamptz not null default now(),
  referrer    text,
  user_agent  text,
  ip_hash     text,
  country     text,
  device      text
);

create index if not exists qr_scans_qr_code_id_idx
  on public.qr_scans (qr_code_id);

create index if not exists qr_scans_scanned_at_idx
  on public.qr_scans (scanned_at);

create index if not exists qr_scans_qr_code_id_scanned_at_idx
  on public.qr_scans (qr_code_id, scanned_at desc);

alter table public.qr_scans enable row level security;

-- Owners can read scans for codes they own. No insert/update/delete policies for
-- clients (logging goes through log_qr_scan below) and no public read.
create policy qr_scans_select_own on public.qr_scans
  for select to authenticated
  using (
    not public.is_portal_user()
    and exists (
      select 1 from public.qr_codes c
      where c.id = qr_scans.qr_code_id
        and c.owner_id = (select auth.uid())
    )
  );

-- Per-code scan totals. security_invoker so the querying user's RLS on qr_scans
-- applies — an owner only ever sees counts for their own codes.
create or replace view public.qr_code_scan_counts
  with (security_invoker = on) as
  select qr_code_id, count(*)::bigint as scan_count
  from public.qr_scans
  group by qr_code_id;

grant select on public.qr_code_scan_counts to authenticated;

-- Richer resolver: the redirect route needs both the code id (to log the scan)
-- and the destination (to 302). Returns at most one row for an active dynamic
-- URL code; nothing otherwise. Supersedes the scalar resolve_qr_slug().
drop function if exists public.resolve_qr_slug(text);

create or replace function public.resolve_qr_target(p_slug text)
returns table (qr_code_id uuid, destination_url text)
language sql
stable
security definer
set search_path = public
as $$
  select id, destination_url
  from public.qr_codes
  where slug = p_slug
    and is_active
    and is_dynamic
    and type = 'url'
    and destination_url is not null
  limit 1;
$$;

revoke all on function public.resolve_qr_target(text) from public;
grant execute on function public.resolve_qr_target(text) to anon, authenticated;

-- Public scan logger. SECURITY DEFINER so anon can record a scan with no table
-- grant. Guarded by an EXISTS on an active code, so callers can't forge scans
-- for missing/inactive ids. Returns nothing.
create or replace function public.log_qr_scan(
  p_qr_code_id uuid,
  p_referrer   text default null,
  p_user_agent text default null,
  p_ip_hash    text default null,
  p_country    text default null,
  p_device     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.qr_scans
    (qr_code_id, referrer, user_agent, ip_hash, country, device)
  select p_qr_code_id, p_referrer, p_user_agent, p_ip_hash, p_country, p_device
  where exists (
    select 1 from public.qr_codes c
    where c.id = p_qr_code_id and c.is_active
  );
end;
$$;

revoke all on function
  public.log_qr_scan(uuid, text, text, text, text, text) from public;
grant execute on function
  public.log_qr_scan(uuid, text, text, text, text, text) to anon, authenticated;

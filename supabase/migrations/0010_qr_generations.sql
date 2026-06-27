-- TD Studios Invoice App — QR generation history
--
-- An append-only log of every QR code generated, from BOTH the signed-in admin
-- generator (/qr) and the public, no-auth generator (/qr-generator). It is
-- distinct from public.qr_codes (which stores only saved *dynamic* codes): this
-- records every code that gets generated, saved or not.
--
-- Privacy/abuse note: `content` holds whatever URL/text a (possibly anonymous)
-- visitor typed. There is no public read — only admins can see this history, via
-- the service-role client (lib/supabase/admin.ts), which bypasses RLS. Anonymous
-- visitors can only INSERT, and only through the SECURITY DEFINER logger below;
-- they can never read, update, or delete, and cannot reach the table directly.

create table if not exists public.qr_generations (
  id          uuid primary key default gen_random_uuid(),
  -- Null for anonymous public-page generations; set to the user for signed-in.
  owner_id    uuid references auth.users (id) on delete set null,
  source      text not null default 'public'
    check (source in ('public', 'admin')),
  type        text not null default 'url'
    check (type in ('url', 'instagram', 'text')),
  content     text not null,
  style_json  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists qr_generations_created_at_idx
  on public.qr_generations (created_at desc);

create index if not exists qr_generations_owner_id_idx
  on public.qr_generations (owner_id);

-- RLS on with NO policies for normal roles: the cookie-scoped client (anon,
-- authenticated, portal) can neither read nor write directly. Inserts happen
-- only via the SECURITY DEFINER logger; admin reads happen only via the
-- service-role client, which is not subject to RLS.
alter table public.qr_generations enable row level security;

-- Public generation logger. SECURITY DEFINER so an anonymous visitor can record
-- a generation with no table grant. Stamps owner_id from the caller's JWT (null
-- when anonymous), validates the enums, caps content length, and inserts. Best
-- effort and side-effect-only; returns nothing.
create or replace function public.log_qr_generation(
  p_content text,
  p_type    text default 'url',
  p_source  text default 'public',
  p_style   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_content is null or length(trim(p_content)) = 0 then
    return;
  end if;

  insert into public.qr_generations (owner_id, source, type, content, style_json)
  values (
    auth.uid(),
    case when p_source in ('public', 'admin') then p_source else 'public' end,
    case when p_type in ('url', 'instagram', 'text') then p_type else 'url' end,
    left(p_content, 2000),
    coalesce(p_style, '{}'::jsonb)
  );
end;
$$;

revoke all on function
  public.log_qr_generation(text, text, text, jsonb) from public;
grant execute on function
  public.log_qr_generation(text, text, text, jsonb) to anon, authenticated;

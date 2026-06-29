-- TD Studios Invoice App — Bio Pages: extended styling (0013)
--
-- Adds the styling controls surfaced by the real-time visual editor:
-- a second accent (gradient end), typography, button style/shape, and spacing.
-- All columns are NOT NULL with sane defaults, so existing rows keep rendering.
--
-- The public /u/<username> page reads only through get_bio_page(), so that
-- SECURITY DEFINER helper is updated to return the new fields too. Hidden links,
-- drafts, and owner_id remain unexposed (unchanged). Run AFTER 0012.

alter table public.bio_pages
  add column if not exists accent_color_2 text not null default '#9D5CFF'
    check (accent_color_2 ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists font_family text not null default 'sans'
    check (font_family in ('sans', 'serif', 'mono', 'rounded')),
  add column if not exists button_style text not null default 'glass'
    check (button_style in ('solid', 'outline', 'soft', 'glass')),
  add column if not exists button_shape text not null default 'rounded'
    check (button_shape in ('rounded', 'pill', 'square')),
  add column if not exists spacing text not null default 'normal'
    check (spacing in ('compact', 'normal', 'relaxed'));

-- Re-create the public reader to expose the new style fields. Same security
-- posture as 0012: published-only, no owner_id, anon + authenticated execute.
-- DROP first because PostgreSQL forbids CREATE OR REPLACE when the return type
-- changes (SQLSTATE 42P13). Grants are re-applied immediately after.
drop function if exists public.get_bio_page(text);

create function public.get_bio_page(p_username text)
returns table (
  id             uuid,
  username       text,
  display_name   text,
  bio            text,
  avatar_path    text,
  theme          text,
  accent_color   text,
  accent_color_2 text,
  font_family    text,
  button_style   text,
  button_shape   text,
  spacing        text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, username, display_name, bio, avatar_path, theme, accent_color,
         accent_color_2, font_family, button_style, button_shape, spacing
  from public.bio_pages
  where username = lower(p_username)
    and is_published
  limit 1;
$$;

revoke all on function public.get_bio_page(text) from public;
grant execute on function public.get_bio_page(text) to anon, authenticated;

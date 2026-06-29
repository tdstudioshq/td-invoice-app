-- TD Studios Platform — remove Bio Pages (link-in-bio)
--
-- The link-in-bio builder (added in 0012, styled in 0013) is being removed
-- entirely: the `/link-builder` builder, the public `/u/<username>` page, and
-- all of their data. Dropping the tables also drops their indexes, triggers,
-- and RLS policies. `cascade` clears the cross-table foreign keys.
--
-- Children first, then the parent, to keep the intent obvious.

drop table if exists public.bio_page_views cascade;
drop table if exists public.bio_links cascade;
drop table if exists public.bio_pages cascade;

-- Public SECURITY DEFINER readers / logger (0012; get_bio_page recreated in 0013).
drop function if exists public.get_bio_page(text);
drop function if exists public.get_bio_links(uuid);
drop function if exists public.log_bio_page_view(uuid, text, text);

-- Drop the bio-page avatar Storage RLS policies (created in 0012). These are
-- ordinary policy DDL and are safe to drop here.
drop policy if exists "bio_assets_owner_insert" on storage.objects;
drop policy if exists "bio_assets_owner_update" on storage.objects;
drop policy if exists "bio_assets_owner_delete" on storage.objects;

-- NOTE: the `bio-page-assets` bucket and its objects are intentionally NOT
-- removed here. Hosted Supabase forbids direct DML on the storage system tables
-- ("Direct deletion from storage tables is not allowed"), so
--   delete from storage.objects ...
--   delete from storage.buckets ...
-- both fail. Remove the leftover bucket (and any objects in it) manually via the
-- Supabase Dashboard (Storage → bio-page-assets → delete) or the Storage API
-- (e.g. `supabase.storage.emptyBucket('bio-page-assets')` then
-- `supabase.storage.deleteBucket('bio-page-assets')`). With the policies above
-- dropped, the bucket is inert in the meantime.

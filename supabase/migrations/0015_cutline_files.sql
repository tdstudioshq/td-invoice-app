-- TD Studios Invoice App — private Storage bucket for the Cutline Generator
--
-- Backs the admin-only /tools/cutline-generator tool. Holds the temporarily
-- uploaded source artwork and the generated print-ready cutline PDFs, scoped to
-- the admin who created them.
--
-- Object key convention:  {user_id}/{job_id}/{in|out}/{filename}
--   e.g.  a1b2…/9f3c…/in/24k-nowlater-back.jpg     (uploaded source)
--          a1b2…/9f3c…/out/24k-nowlater-back.pdf    (generated PDF)
--          a1b2…/9f3c…/out/cutlines-9f3c….zip       (batch ZIP)
--
-- The bucket is private; downloads are always served via short-lived signed URLs
-- created server-side after an auth check. There is no public read access and no
-- companion table — these objects are ephemeral working files.

-- ---------------------------------------------------------------------------
-- Private bucket (id == name). public = false → no anonymous object access.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cutline-files', 'cutline-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects, scoped to this bucket.
-- The first path segment (storage.foldername(name))[1] is the owning user id, so
-- each authenticated user has full CRUD over only their own folder. The tool
-- itself is additionally gated by requireAdmin() / isAdminEmail() in the route
-- handlers — RLS here is defense in depth.
-- ---------------------------------------------------------------------------
create policy "cutline_files_owner_all"
on storage.objects for all to authenticated
using (
  bucket_id = 'cutline-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'cutline-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- TD Studios Invoice App — private Storage bucket for client files
--
-- Companion to 0003_client_portal.sql. Creates the `client-files` bucket and the
-- storage.objects RLS policies that mirror the table policies.
--
-- Object key convention:  {client_id}/{category}/{filename}
--   e.g.  3f9c…/uploads/brief.pdf
--          3f9c…/final-files/logo.svg
--          3f9c…/invoices/TD-INV-0007.pdf
-- category folder names use hyphens (uploads, final-files, invoices); the
-- file_category enum value 'final_files' maps to the 'final-files' path segment
-- in application code (see lib/portal.ts STORAGE_PREFIX).
--
-- Downloads are always served through short-lived signed URLs created server-side
-- (app/api/files/[fileId]/route.ts) after an ownership check — the bucket is
-- private and raw object URLs are never exposed.

-- ---------------------------------------------------------------------------
-- Private bucket (id == name). public = false → no anonymous object access.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects, scoped to this bucket.
-- The first path segment (storage.foldername(name))[1] is the client_id.
-- ---------------------------------------------------------------------------

-- Admins: full CRUD over objects belonging to a client they own.
create policy "client_files_admin_all"
on storage.objects for all to authenticated
using (
  bucket_id = 'client-files'
  and exists (
    select 1 from public.clients c
     where c.id = ((storage.foldername(name))[1])::uuid
       and c.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'client-files'
  and exists (
    select 1 from public.clients c
     where c.id = ((storage.foldername(name))[1])::uuid
       and c.owner_id = auth.uid()
  )
);

-- Portal users: read objects belonging to their assigned client.
create policy "client_files_portal_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-files'
  and ((storage.foldername(name))[1])::uuid = public.portal_client_id()
);

-- Portal users: upload only into their client's uploads/ prefix, only when the
-- can_upload flag is enabled. No update/delete for portal users.
create policy "client_files_portal_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'client-files'
  and ((storage.foldername(name))[1])::uuid = public.portal_client_id()
  and (storage.foldername(name))[2] = 'uploads'
  and public.portal_can_upload()
);

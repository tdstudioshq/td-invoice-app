-- TD Studios Invoice App — hide archived / hidden-project files at the Storage layer
--
-- Security fix. Migration 0016 recreated the *table* policy
-- client_files_portal_select (on public.client_files) to hide archived files and
-- files of draft/archived projects from portal users — but the *storage.objects*
-- policy of the same name (from 0004) was left as a coarse "first path segment ==
-- your client id" grant. Archival/hiding only sets a row flag; the object bytes
-- stay in the bucket. So a portal user could still enumerate and fetch a hidden
-- file directly from Storage (supabase.storage.from('client-files').list(...) +
-- .createSignedUrl(...)), bypassing both the table RLS and the /api/files route —
-- defeating the "archived files disappear from the portal" guarantee.
--
-- Fix: gate the portal Storage read on the existence of a portal-VISIBLE
-- client_files row for that exact object key (same predicate as the table policy).
-- Admin storage access (client_files_admin_all) and the portal upload policy
-- (client_files_portal_insert) are untouched — a just-uploaded object is read
-- back through the app's signed-URL route, not by a direct portal Storage read.

drop policy if exists "client_files_portal_select" on storage.objects;
create policy "client_files_portal_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'client-files'
  and exists (
    select 1
    from public.client_files cf
    where cf.storage_path = storage.objects.name
      and cf.client_id = public.portal_client_id()
      and cf.archived_at is null
      and (
        cf.project_id is null
        or exists (
          select 1
          from public.client_projects p
          where p.id = cf.project_id
            and p.status not in ('draft', 'archived')
        )
      )
  )
);

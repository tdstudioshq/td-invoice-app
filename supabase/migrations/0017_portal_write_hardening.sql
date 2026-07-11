-- TD Studios Invoice App — portal-subsystem write hardening
--
-- Security fix for a policy gap dating back to 0003, caught by the RLS
-- verification probes for the client-projects feature (0016):
--
--   The portal tables' owner-scoped *_admin_all policies accepted ANY
--   authenticated user who stamped themselves as owner_id (the column
--   default), because "admin" was defined only as owner_id = auth.uid().
--   A portal user or self-signup customer could therefore INSERT rows into
--   client_users / client_file_folders / client_files / client_projects
--   owned by THEMSELVES — invisible to the real admin. Worst case: inserting
--   a client_users row mapping their own auth user to a known client id
--   would have granted them that client's entire portal (files + invoices).
--
-- Fix: these policies now additionally require that the caller OWNS the
-- referenced clients row — the same check the storage.objects policies in
-- 0004 always made (which is why Storage was never affected). The clients
-- subquery is itself RLS-filtered, so:
--   * admins match (they own their clients),
--   * portal users fail (they can see their client row but don't own it),
--   * customers fail (they can see no client rows at all).
-- Legit portal operations are untouched — they run through the separate
-- *_portal_* / *_select_self policies, not these.

drop policy if exists client_users_admin_all on public.client_users;
create policy client_users_admin_all on public.client_users
  for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_users.client_id and c.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_users.client_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists client_file_folders_admin_all on public.client_file_folders;
create policy client_file_folders_admin_all on public.client_file_folders
  for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_file_folders.client_id and c.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_file_folders.client_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists client_files_admin_all on public.client_files;
create policy client_files_admin_all on public.client_files
  for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_files.client_id and c.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_files.client_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists client_projects_admin_all on public.client_projects;
create policy client_projects_admin_all on public.client_projects
  for all to authenticated
  using (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_projects.client_id and c.owner_id = auth.uid()
    )
  )
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_projects.client_id and c.owner_id = auth.uid()
    )
  );

-- file_activity: inserts previously only required actor_id = auth.uid(), so
-- any authenticated user could write log rows for any client. Now the actor
-- must be that client's portal user or the client's owning admin — matching
-- the two legitimate logging paths (portal download/upload, admin actions).
drop policy if exists file_activity_insert_self on public.file_activity;
create policy file_activity_insert_self on public.file_activity
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      client_id = public.portal_client_id()
      or exists (
        select 1 from public.clients c
        where c.id = file_activity.client_id and c.owner_id = auth.uid()
      )
    )
  );

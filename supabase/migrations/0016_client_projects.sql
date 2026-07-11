-- TD Studios Invoice App — client projects, file archival & forced password change
--
-- Additive extension of the client portal (0003/0004):
--
--   * client_projects — per-client design projects with a status workflow
--     (draft → in_progress → awaiting_review → revision_requested → approved →
--     completed → archived). Admin-managed; portal users can only READ their
--     own client's non-draft, non-archived projects.
--   * client_files gains project linkage (project_id), admin archival
--     (archived_at — archived files disappear from the portal), and an explicit
--     display_order.
--   * client_users gains must_change_password for provisioned temp-password
--     logins. A SECURITY DEFINER RPC lets a user clear ONLY their own flag —
--     a self-UPDATE policy would also expose can_upload, since RLS is
--     row-level, not column-level.
--   * The client-files bucket gets a server-enforced 25 MB per-object cap
--     (mirrors MAX_UPLOAD_BYTES in lib/portal.ts) now that admin uploads go
--     straight from the browser to Storage via signed upload URLs.
--
-- The only policy this file drops is client_files_portal_select (from 0003),
-- recreated below with the archival guards — the same pattern 0003 used to
-- tighten 0002's policies. Portal visibility here must stay in sync with
-- PORTAL_HIDDEN_PROJECT_STATUSES in lib/projects.ts.

-- ---------------------------------------------------------------------------
-- Project status enum
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum (
      'draft',
      'in_progress',
      'awaiting_review',
      'revision_requested',
      'approved',
      'completed',
      'archived'
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- client_projects — a unit of work for one client, owning a set of files.
-- ---------------------------------------------------------------------------
create table if not exists public.client_projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade default auth.uid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  name        text not null,
  description text,
  status      public.project_status not null default 'draft',
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists client_projects_owner_id_idx  on public.client_projects (owner_id);
create index if not exists client_projects_client_id_idx on public.client_projects (client_id);
create index if not exists client_projects_status_idx    on public.client_projects (status);

create trigger client_projects_set_updated_at
  before update on public.client_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_files — project linkage, archival, display order.
-- Deleting a project detaches its files (set null); it never deletes them.
-- ---------------------------------------------------------------------------
alter table public.client_files
  add column if not exists project_id    uuid references public.client_projects (id) on delete set null,
  add column if not exists archived_at   timestamptz,
  add column if not exists display_order integer not null default 0;

create index if not exists client_files_project_id_idx on public.client_files (project_id);

-- ---------------------------------------------------------------------------
-- client_users — forced password change for provisioned temp passwords.
-- ---------------------------------------------------------------------------
alter table public.client_users
  add column if not exists must_change_password boolean not null default false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.client_projects enable row level security;

drop policy if exists client_projects_admin_all on public.client_projects;
create policy client_projects_admin_all on public.client_projects
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Portal users read their client's projects, excluding admin staging ('draft')
-- and retired ('archived') ones. Keep in sync with lib/projects.ts.
drop policy if exists client_projects_portal_select on public.client_projects;
create policy client_projects_portal_select on public.client_projects
  for select to authenticated
  using (
    client_id = public.portal_client_id()
    and status not in ('draft', 'archived')
  );

-- Recreate the portal file SELECT so archived files — and files that belong to
-- a hidden project — vanish from the portal. Admin reads are unaffected
-- (client_files_admin_all from 0003 is untouched).
drop policy if exists client_files_portal_select on public.client_files;
create policy client_files_portal_select on public.client_files
  for select to authenticated
  using (
    client_id = public.portal_client_id()
    and archived_at is null
    and (
      project_id is null
      or exists (
        select 1
        from public.client_projects p
        where p.id = client_files.project_id
          and p.status not in ('draft', 'archived')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- clear_must_change_password() — a user clears ONLY their own flag after
-- successfully setting a new password. SECURITY DEFINER (runs as the table
-- owner, bypassing RLS) because granting portal users UPDATE on client_users
-- would let them flip can_upload too. No-op for users without a portal row.
-- ---------------------------------------------------------------------------
create or replace function public.clear_must_change_password()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.client_users
     set must_change_password = false
   where user_id = auth.uid()
     and revoked_at is null;
$$;

revoke execute on function public.clear_must_change_password() from public, anon;
grant execute on function public.clear_must_change_password() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: server-enforced per-object size cap for the client-files bucket.
-- Admin uploads now go browser → Storage via signed upload URLs (file bytes
-- never pass through the app server), so the bucket limit is the authoritative
-- size gate. allowed_mime_types is intentionally NOT set: design formats
-- (.ai/.psd/.eps) commonly arrive as application/octet-stream and the mobile
-- app uploads HEIC — the extension allowlist is enforced at ticket-mint time
-- in app code instead (lib/uploads.ts).
-- ---------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 26214400  -- 25 MB, mirrors MAX_UPLOAD_BYTES
 where id = 'client-files';

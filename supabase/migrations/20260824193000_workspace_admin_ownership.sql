-- ---------------------------------------------------------------------------
-- Workspace admin ownership — several real admin logins, ONE owned dataset.
--
-- THE PROBLEM
-- `ADMIN_EMAILS` is a server-only env allowlist read by `isAdminEmail()`. It
-- gates ROUTES. Postgres cannot read it, so every owner-scoped policy from 0002
-- onward says `owner_id = auth.uid()` — which means a second admin passes
-- `requireAdmin()`, reaches /dashboard, and then sees nothing, because every
-- row belongs to the first admin's uid. Worse, 0003's write policies check
-- `owner_id = auth.uid()`, so a second admin cannot insert INTO the shared
-- dataset at all; they can only fork a private one (and burn numbers from the
-- global invoice_number_seq while doing it).
--
-- THE FIX — remap the identity, do not widen the predicate.
-- `public.current_owner_id()` answers "which owner_id may I act as?":
--   * a workspace admin  -> the canonical workspace owner uid
--   * everyone else      -> auth.uid(), exactly as today
-- Policies then read `owner_id = (select public.current_owner_id())`. The
-- predicate SHAPE is unchanged, so `with check` still blocks ownership
-- reassignment and inserts still validate. Nothing is granted to
-- `authenticated` at large, and no portal/customer predicate is touched:
-- portal access runs entirely through `portal_client_id()` / `is_portal_user()`,
-- which never reference owner_id.
--
-- NOT CHANGED, DELIBERATELY
--   * `profiles` (0009) stays owner-only; admins read it via the service role.
--   * `client_file_favorites.using` stays `user_id = auth.uid()` — a star is
--     personal. Only its client-ownership sub-clause is remapped.
--   * `file_activity.actor_id` stays `auth.uid()` — attribution must remain
--     per-admin, so the activity timeline still says who actually did it.
--   * 0017's `exists (... clients c ... )` hardening is preserved on every
--     policy it added it to; only the uid it compares against is remapped.
--   * `qr_generations` (0010) has RLS on with no policies. Untouched.
--   * `cutline_files_owner_all` (0015) is a genuinely per-user folder policy on
--     a bucket nothing writes to any more. Untouched.
--   * Existing rows are NOT re-owned. Verified before writing this migration:
--     every row in all 13 owner-scoped tables already belongs to one uid.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Who is an admin, and who owns the workspace — in the database.
--
--    Both tables run RLS with NO policies and have their default grants
--    revoked, the same model as the anonymous-intake tables
--    (20260822182058): unreachable by `anon` and `authenticated` alike,
--    readable only by the service role and by the SECURITY DEFINER helper
--    below. A user therefore cannot promote themselves by writing a row —
--    the same invariant `ADMIN_EMAILS` gives at the application layer.
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);

alter table public.workspace_admins enable row level security;
revoke all on public.workspace_admins from anon, authenticated;

comment on table public.workspace_admins is
  'Auth uids allowed to act as the canonical workspace owner. Mirrors the ADMIN_EMAILS env allowlist; reconcile with `npm run admin:sync`. RLS on with no policies - service role only.';

-- Exactly one row, enforced by the singleton primary key.
create table if not exists public.workspace_owner (
  singleton boolean primary key default true check (singleton),
  owner_id  uuid not null references auth.users (id)
);

alter table public.workspace_owner enable row level security;
revoke all on public.workspace_owner from anon, authenticated;

comment on table public.workspace_owner is
  'The single uid every owner-scoped row is written under. Seeded from ADMIN_EMAILS[0] by `npm run admin:sync`.';

-- ---------------------------------------------------------------------------
-- 2. Portal users and workspace admins are mutually exclusive.
--
--    Enforced in the DATABASE, both directions, because an application-only
--    check would leave the invariant to whichever code path forgot it. A
--    `check` constraint cannot see another table, so this is a trigger pair.
-- ---------------------------------------------------------------------------
create or replace function public.assert_not_portal_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.client_users
     where user_id = new.user_id
       and revoked_at is null
  ) then
    raise exception
      'uid % has an active client_users portal mapping and cannot be a workspace admin',
      new.user_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_admins_no_portal_user on public.workspace_admins;
create trigger workspace_admins_no_portal_user
  before insert or update on public.workspace_admins
  for each row execute function public.assert_not_portal_user();

-- The reverse: an admin cannot be handed portal access either, which is what
-- makes this an invariant rather than a one-way check. Revoking a mapping
-- (setting revoked_at) still passes, so nothing blocks a restore.
create or replace function public.assert_not_workspace_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revoked_at is null and exists (
    select 1 from public.workspace_admins where user_id = new.user_id
  ) then
    raise exception
      'uid % is a workspace admin and cannot be granted client portal access',
      new.user_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists client_users_no_workspace_admin on public.client_users;
create trigger client_users_no_workspace_admin
  before insert or update on public.client_users
  for each row execute function public.assert_not_workspace_admin();

-- ---------------------------------------------------------------------------
-- 3. The one helper every policy and every application write path agrees on.
--
--    SECURITY DEFINER with a fixed search_path (same shape as
--    portal_client_id() / is_portal_user() from 0003) so it can read the two
--    policy-less tables above.
--
--    FAIL-SAFE: if `workspace_owner` is empty, or the caller is not an admin,
--    it returns auth.uid() — today's exact behavior — rather than NULL, which
--    would silently deny every row to everyone.
-- ---------------------------------------------------------------------------
create or replace function public.current_owner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when exists (
        select 1 from public.workspace_admins wa where wa.user_id = auth.uid()
      )
      then (select wo.owner_id from public.workspace_owner wo limit 1)
    end,
    auth.uid()
  );
$$;

comment on function public.current_owner_id() is
  'The owner_id the caller may read and write: the canonical workspace owner '
  'for a workspace admin, auth.uid() for everyone else. Used by RLS and by '
  'the application''s currentOwnerId() helper so the two cannot disagree.';

revoke all on function public.current_owner_id() from public;
grant execute on function public.current_owner_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Best-effort seed. `npm run admin:sync` is authoritative and idempotent;
--    this only saves a step on a fresh environment. If the lookup finds
--    nothing the fail-safe in current_owner_id() keeps behavior identical to
--    today, so a fresh project still pushes cleanly.
-- ---------------------------------------------------------------------------
insert into public.workspace_owner (singleton, owner_id)
select true, u.id
  from auth.users u
 where lower(u.email) = 'tyler.diorio@gmail.com'
 limit 1
on conflict (singleton) do nothing;

insert into public.workspace_admins (user_id, note)
select wo.owner_id, 'primary owner (seeded by migration)'
  from public.workspace_owner wo
on conflict (user_id) do nothing;

do $$
begin
  if not exists (select 1 from public.workspace_owner) then
    raise notice
      'workspace_owner is empty — current_owner_id() falls back to auth.uid(). Run `npm run admin:sync`.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Core tables (0001/0002, write policies rewritten by 0003).
--    Same four policies per table, same names, same portal guard on writes.
--    The SELECT policy deliberately has no is_portal_user() guard — 0003 left
--    it off, and portal reads arrive through the additive *_portal_select
--    policies instead.
--
--    `(select public.current_owner_id())` is wrapped so Postgres hoists it
--    into an InitPlan and evaluates it once per statement, not once per row —
--    the same reason 0007/0022 write `(select auth.uid())`.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'invoices', 'invoice_items', 'payments', 'company_settings']
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I;', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (owner_id = (select public.current_owner_id()));',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (owner_id = (select public.current_owner_id()) and not public.is_portal_user());',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (owner_id = (select public.current_owner_id()) and not public.is_portal_user()) with check (owner_id = (select public.current_owner_id()) and not public.is_portal_user());',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (owner_id = (select public.current_owner_id()) and not public.is_portal_user());',
      t || '_delete_own', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Portal-layer tables — the 0017 hardened admin policies.
--    The `exists (... clients c ...)` sub-clause is PRESERVED verbatim except
--    for the uid it compares against. Dropping it would reopen the 0017 hole
--    (a self-owned INSERT into client_users mapping your own auth user into
--    someone else's portal), so it must survive every edit here.
-- ---------------------------------------------------------------------------
drop policy if exists client_users_admin_all on public.client_users;
create policy client_users_admin_all on public.client_users
  for all to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_users.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  )
  with check (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_users.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  );

drop policy if exists client_file_folders_admin_all on public.client_file_folders;
create policy client_file_folders_admin_all on public.client_file_folders
  for all to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_file_folders.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  )
  with check (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_file_folders.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  );

drop policy if exists client_files_admin_all on public.client_files;
create policy client_files_admin_all on public.client_files
  for all to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_files.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  )
  with check (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_files.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  );

drop policy if exists client_projects_admin_all on public.client_projects;
create policy client_projects_admin_all on public.client_projects
  for all to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_projects.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  )
  with check (
    owner_id = (select public.current_owner_id())
    and exists (
      select 1 from public.clients c
      where c.id = client_projects.client_id
        and c.owner_id = (select public.current_owner_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. file_activity. `actor_id = auth.uid()` is intentionally NOT remapped:
--    the log records who actually performed the action, so the timeline can
--    still distinguish the three admins. Only the client-ownership branch
--    moves to the canonical owner.
-- ---------------------------------------------------------------------------
drop policy if exists file_activity_admin_select on public.file_activity;
create policy file_activity_admin_select on public.file_activity
  for select to authenticated
  using (owner_id = (select public.current_owner_id()));

drop policy if exists file_activity_insert_self on public.file_activity;
create policy file_activity_insert_self on public.file_activity
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      client_id = public.portal_client_id()
      or exists (
        select 1 from public.clients c
        where c.id = file_activity.client_id
          and c.owner_id = (select public.current_owner_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 8. QR codes and their scans (0007 / 0008).
-- ---------------------------------------------------------------------------
drop policy if exists qr_codes_select_own on public.qr_codes;
create policy qr_codes_select_own on public.qr_codes
  for select to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and not public.is_portal_user()
  );

drop policy if exists qr_codes_insert_own on public.qr_codes;
create policy qr_codes_insert_own on public.qr_codes
  for insert to authenticated
  with check (
    owner_id = (select public.current_owner_id())
    and not public.is_portal_user()
  );

drop policy if exists qr_codes_update_own on public.qr_codes;
create policy qr_codes_update_own on public.qr_codes
  for update to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select public.current_owner_id())
    and not public.is_portal_user()
  );

drop policy if exists qr_codes_delete_own on public.qr_codes;
create policy qr_codes_delete_own on public.qr_codes
  for delete to authenticated
  using (
    owner_id = (select public.current_owner_id())
    and not public.is_portal_user()
  );

drop policy if exists qr_scans_select_own on public.qr_scans;
create policy qr_scans_select_own on public.qr_scans
  for select to authenticated
  using (
    not public.is_portal_user()
    and exists (
      select 1 from public.qr_codes c
      where c.id = qr_scans.qr_code_id
        and c.owner_id = (select public.current_owner_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Tasks (0022). The linked-client check is preserved.
-- ---------------------------------------------------------------------------
drop policy if exists tasks_owner_all on public.tasks;
create policy tasks_owner_all on public.tasks
  for all to authenticated
  using (owner_id = (select public.current_owner_id()))
  with check (
    owner_id = (select public.current_owner_id())
    and (
      client_id is null
      or exists (
        select 1 from public.clients c
        where c.id = client_id
          and c.owner_id = (select public.current_owner_id())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Portal DAM favorites (0019). `using` stays per-user: a star belongs to
--     the person who placed it, not to the workspace. Only the admin branch of
--     the access check is remapped, so all three admins may star any file in
--     the workspace — each keeping their own stars.
-- ---------------------------------------------------------------------------
drop policy if exists client_file_favorites_own on public.client_file_favorites;
create policy client_file_favorites_own on public.client_file_favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.client_files f
       where f.id = client_file_favorites.file_id
         and f.client_id = client_file_favorites.client_id
    )
    and (
      exists (
        select 1 from public.clients c
         where c.id = client_file_favorites.client_id
           and c.owner_id = (select public.current_owner_id())
      )
      or client_file_favorites.client_id = public.portal_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 11. Storage. Without this the other admins can reach the file ROWS but not
--     the BYTES, so every download route and the portal file browser fail for
--     them. The portal policies (0004 insert, 0018 select) are untouched.
-- ---------------------------------------------------------------------------
drop policy if exists "client_files_admin_all" on storage.objects;
create policy "client_files_admin_all"
on storage.objects for all to authenticated
using (
  bucket_id = 'client-files'
  and exists (
    select 1 from public.clients c
     where c.id = ((storage.foldername(name))[1])::uuid
       and c.owner_id = (select public.current_owner_id())
  )
)
with check (
  bucket_id = 'client-files'
  and exists (
    select 1 from public.clients c
     where c.id = ((storage.foldername(name))[1])::uuid
       and c.owner_id = (select public.current_owner_id())
  )
);

-- ---------------------------------------------------------------------------
-- PRE-EXISTING BUG, NOT FIXED HERE (deliberately — this touches real data).
--
-- `company_settings` holds exactly one row whose owner_id is NULL, so
-- `owner_id = <anything>` is never true and NO admin can see it. The settings
-- page therefore reads empty and `updateSettingsAction` inserts a SECOND row
-- instead of updating this one. This migration does not change that; it is
-- orthogonal to admin sharing and predates it. Adopt the row when you have
-- decided that is what you want:
--
--   update public.company_settings
--      set owner_id = (select owner_id from public.workspace_owner)
--    where owner_id is null;
--
-- ---------------------------------------------------------------------------
-- VERIFICATION — run as each admin (anon key + their session), not as the
-- service role, which bypasses RLS and proves nothing.
--
--   -- 1. Identity resolves as expected.
--   select auth.uid(), public.current_owner_id();
--
--   -- 2. Each admin sees the same workspace.
--   select count(*) from public.clients;   -- expect 34
--   select count(*) from public.invoices;  -- expect 38
--
--   -- 3. A portal user still sees exactly one client and no drafts.
--   select count(*) from public.clients;                          -- expect 1
--   select count(*) from public.invoices where status = 'draft';  -- expect 0
--   select public.current_owner_id() = auth.uid();                -- expect true
--
--   -- 4. A portal user cannot self-promote (both must fail).
--   insert into public.workspace_admins (user_id) values (auth.uid());
--   select * from public.workspace_admins;
--
--   -- 5. Mutual exclusion holds (both must raise 42501, as service role).
--   insert into public.workspace_admins (user_id)
--     select user_id from public.client_users where revoked_at is null limit 1;
--   insert into public.client_users (owner_id, user_id, client_id)
--     select owner_id, (select owner_id from public.workspace_owner), id
--       from public.clients limit 1;
-- ---------------------------------------------------------------------------

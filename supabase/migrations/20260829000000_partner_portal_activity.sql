-- TD Studios — partner portal activity: an event log, notification settings, and
-- an honest `updated_at` for the job grid.
--
-- Three additive pieces, no existing table/policy/bucket touched:
--
--   1. design_job_files bumps its job's `updated_at`, so "recently updated"
--      means something on the new grid.
--   2. partner_job_events — the normalized activity log every notification is
--      dispatched from.
--   3. partner_notification_settings — per-company channel + mute config, so
--      adding SMS later is a row, not a rewrite.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. `updated_at` has to mean "last activity", not "last time the name changed".
--
-- design_jobs already has set_updated_at, but it only fires on an UPDATE of the
-- job row — and the two things that most often happen to a job (artwork added,
-- artwork removed) are INSERTs and DELETEs on a CHILD table. Before this, a job
-- could gain six files and still sort as untouched, which is exactly the sort
-- the new grid defaults to.
--
-- Files only. design_job_items deliberately gets no such trigger: every item
-- change goes through update_design_job(), which updates the job row itself
-- first, so set_updated_at has already fired by the time the items move.
--
-- Safe during a cascade: ON DELETE CASCADE deletes the parent row BEFORE its
-- children, so when a job is deleted this fires against a row that is already
-- gone and updates zero rows rather than erroring.
-- ---------------------------------------------------------------------------
create or replace function public.touch_design_job_from_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid := coalesce(new.job_id, old.job_id);
begin
  if v_job is not null then
    update public.design_jobs set updated_at = now() where id = v_job;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists design_job_files_touch_job on public.design_job_files;
create trigger design_job_files_touch_job
  after insert or delete on public.design_job_files
  for each row execute function public.touch_design_job_from_file();


-- ---------------------------------------------------------------------------
-- 2. partner_job_events — one row per meaningful thing that happened.
--
-- SCOPING FOLLOWS THE PARTNER TABLES, NOT THE OWNER-SCOPED ONES. Like
-- design_jobs, an event belongs to the print COMPANY and no TD Studios admin
-- owns it, so `company_id` is the scoping column and admins read through the
-- service role. See the 20260825120000 header.
--
-- `job_id` is ON DELETE SET NULL, not CASCADE, and `job_number`/`job_name` are
-- DENORMALIZED alongside it. That pairing is the point: a "job deleted" event
-- whose own foreign key deleted it would be useless, so the identity of the job
-- is copied into the row and survives the job itself. It also means the admin
-- feed renders with no join.
--
-- event_type is a `check` rather than a pg enum, for the reason spelled out in
-- 20260826140000: a check widens inside a transaction and `alter type ... add
-- value` does not. Widen it here and in PARTNER_JOB_EVENT_TYPES
-- (lib/partner-jobs/types.ts) together.
-- ---------------------------------------------------------------------------
create table if not exists public.partner_job_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.partner_companies (id) on delete cascade,
  job_id        uuid references public.design_jobs (id) on delete set null,
  -- Copied at write time so the event still reads after the job is deleted.
  job_number    text,
  job_name      text,
  event_type    text not null check (event_type in (
    'job.created',
    'job.updated',
    'job.status_changed',
    'job.done_changed',
    'file.added',
    'file.removed',
    'job.deleted'
  )),
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Who it read as at the time ("Marty", "TD Studios"). Denormalized for the
  -- same reason as job_number: the feed should not need auth.users to render.
  actor_label   text check (actor_label is null or length(actor_label) <= 160),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- The two ways this is ever read: a company's feed, and one job's timeline.
create index if not exists partner_job_events_company_created_idx
  on public.partner_job_events (company_id, created_at desc);
create index if not exists partner_job_events_job_created_idx
  on public.partner_job_events (job_id, created_at desc);

alter table public.partner_job_events enable row level security;

-- Reps may READ their own company's activity and nothing else. There is
-- deliberately NO insert/update/delete policy: events are written only by
-- log_partner_job_event() below (SECURITY DEFINER, so it is not bound by this)
-- or by the service role. A rep therefore cannot forge, amend or erase the
-- record of what they did — which is the whole value of having one.
create policy partner_job_events_partner_select on public.partner_job_events
  for select to authenticated
  using (company_id = public.partner_company_id());


-- ---------------------------------------------------------------------------
-- log_partner_job_event — the ONLY write path.
--
-- SECURITY DEFINER, and every field that matters is DERIVED rather than
-- accepted: `company_id` comes from the job, `actor_user_id` from auth.uid(),
-- and a rep's `actor_label` from their own partner_users row. A caller can
-- therefore not attribute an event to another company, another person, or
-- another job — the only thing they supply is the type and the metadata.
--
-- p_job_id may be null (a job that has just been deleted), in which case the
-- company falls back to the caller's own and the supplied number/name carry the
-- identity. p_actor_label is honored ONLY for the service role, which has no
-- auth.uid() to derive a name from; a rep's value is ignored, not trusted.
-- ---------------------------------------------------------------------------
create or replace function public.log_partner_job_event(
  p_job_id      uuid,
  p_event_type  text,
  p_metadata    jsonb default '{}'::jsonb,
  p_job_number  text default null,
  p_job_name    text default null,
  p_actor_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_scope   uuid := public.partner_company_id();
  v_company uuid;
  v_number  text;
  v_name    text;
  v_actor   text;
  v_id      uuid;
begin
  if p_job_id is not null then
    select j.company_id, j.job_number, j.job_name
      into v_company, v_number, v_name
      from public.design_jobs j
     where j.id = p_job_id;
  end if;

  -- No job (deleted, or never existed): fall back to the caller's own company.
  if v_company is null then
    v_company := v_scope;
    v_number  := p_job_number;
    v_name    := p_job_name;
  end if;

  -- Nothing to scope the event to. The service role logging against a job that
  -- no longer exists lands here; there is no company to attribute it to, so it
  -- is dropped rather than guessed at.
  if v_company is null then
    return null;
  end if;

  -- A signed-in caller may only ever log against their OWN company. The service
  -- role has no auth.uid() and is the studio, so it is not held to this.
  if v_caller is not null and v_company is distinct from v_scope then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if v_caller is null then
    -- Service role: no membership row to read a name from, so the caller says.
    v_actor := nullif(btrim(coalesce(p_actor_label, '')), '');
  else
    select nullif(btrim(coalesce(pu.display_name, '')), '')
      into v_actor
      from public.partner_users pu
     where pu.user_id = v_caller
     limit 1;
  end if;

  insert into public.partner_job_events (
    company_id, job_id, job_number, job_name,
    event_type, actor_user_id, actor_label, metadata
  ) values (
    v_company,
    -- Only reference a job that actually exists, so the FK holds. Null p_job_id
    -- (a delete) falls through this to null, which is the intended state: the
    -- denormalized number and name below are what identify it from then on.
    case when exists (select 1 from public.design_jobs where id = p_job_id)
         then p_job_id end,
    v_number, v_name,
    p_event_type, v_caller, left(v_actor, 160), coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- SECURITY DEFINER functions get EXECUTE for PUBLIC by default. Anonymous
-- visitors have no business writing here, so that is revoked and only a signed-in
-- caller (a rep) and the service role (the studio) are granted it.
revoke all on function public.log_partner_job_event(uuid, text, jsonb, text, text, text) from public;
grant execute on function public.log_partner_job_event(uuid, text, jsonb, text, text, text)
  to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. partner_notification_settings — per-company channel config.
--
-- RLS ON WITH NO POLICIES, plus an explicit revoke: the same model as
-- workspace_admins / workspace_owner, and for the same reason. A table that
-- decides who gets told about a company's activity must not be readable or
-- writable by that company — a rep who could clear `email_recipients` could
-- work unobserved.
--
-- Every column has a working default and the table may legitimately hold ZERO
-- rows: lib/notifications/dispatch.ts falls back to email-on, SMS-off, nothing
-- muted, recipients = ADMIN_EMAILS. A row only ever narrows that.
--
-- `muted_events` is an OPT-OUT list rather than an opt-in one, so a new event
-- type added later notifies by default instead of being silently dropped by
-- every pre-existing row.
-- ---------------------------------------------------------------------------
create table if not exists public.partner_notification_settings (
  company_id       uuid primary key references public.partner_companies (id) on delete cascade,
  email_enabled    boolean not null default true,
  -- Ready for a channel that does not exist yet: dispatch reads this, finds no
  -- registered SMS channel, and skips. Adding Twilio needs no migration.
  sms_enabled      boolean not null default false,
  -- NULL = "use ADMIN_EMAILS". An empty array means "nobody", which is a
  -- different and deliberate answer.
  email_recipients text[],
  sms_recipients   text[],
  muted_events     text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.partner_notification_settings enable row level security;
revoke all on public.partner_notification_settings from anon, authenticated;

create trigger partner_notification_settings_set_updated_at
  before update on public.partner_notification_settings
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- VERIFICATION
--
-- As the REP (anon key + their session):
--   -- 1. Reads only their own company's events.
--   select count(*) from public.partner_job_events;                    -- own company only
--   -- 2. Cannot write one by hand (no insert policy) — must be 0 rows / error.
--   insert into public.partner_job_events (company_id, event_type)
--   values (public.partner_company_id(), 'job.created');
--   -- 3. Cannot log against another company's job (42501).
--   select public.log_partner_job_event('<other company job id>', 'job.updated');
--   -- 4. Cannot read or write notification settings at all (permission denied).
--   select * from public.partner_notification_settings;
--
-- As the SERVICE ROLE:
--   -- 5. Adding a file bumps the job's updated_at.
--   select updated_at from public.design_jobs where id = '<job id>';
-- ---------------------------------------------------------------------------

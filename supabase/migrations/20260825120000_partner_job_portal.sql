-- TD Studios — print-partner job intake portal (V1: Zaza)
--
-- Backs the private partner portal served at zazaorders.tdstudiosny.com. A
-- print company's sales rep signs in, files a structured design job (several
-- products, several reference files, notes), and watches its status. It
-- replaces a group chat, so V1 deliberately has no messaging, quoting,
-- invoicing, approvals or revisions.
--
-- WHERE THIS SITS IN THE EXISTING ROLE MODEL
-- The app already has three roles (admin via the ADMIN_EMAILS allowlist,
-- client-portal user via client_users, self-signup customer). This adds a
-- FOURTH, deliberately built the same way as the portal role in 0003:
--
--   * `partner_users` is the membership table, exactly as `client_users` is for
--     the portal. A user is a partner rep iff they have an active row here
--     whose company is also active. There is no role column anywhere.
--   * `partner_company_id()` / `is_partner_user()` are SECURITY DEFINER helpers
--     mirroring `portal_client_id()` / `is_portal_user()`, so policies can read
--     the membership without recursing through its own RLS.
--   * Nothing here is self-assertable: `partner_users` has NO insert/update
--     policy, so a rep cannot join a company, move to another one, or
--     un-revoke themselves. Memberships are created by the service role (see
--     the manual-setup notes in README).
--
-- OWNERSHIP — these tables have NO `owner_id`, and that is deliberate.
-- A partner job belongs to the PARTNER COMPANY, not to a TD Studios admin, so
-- `company_id` is the scoping column and `partner_company_id()` is the
-- predicate. TD Studios admins reach every job through the service-role client
-- behind `requireAdmin()` — the same arrangement the anonymous-intake tables
-- (0023, 20260822182058) use, and the reason no admin policy appears below.
-- That also keeps this migration independent of `workspace_admins`
-- (20260824193000): partner-job admin access works whether or not that has
-- been applied.
--
-- WHAT PARTNERS MAY DO, IN THE DATABASE
--   select  — their own company's jobs, items, files
--   insert  — a job (status forced to 'new') plus its items and files
--   update  — NOTHING. There is no UPDATE policy on any table here, which is
--             what makes "a rep cannot change job status" an invariant rather
--             than a UI convention. Status moves only through the service role.
--   delete  — NOTHING. A filed job is a record.
--
-- Enumerations are text + check constraints rather than pg enums, matching
-- 0023 / 20260822182058: the product list will grow, and a check constraint can
-- be replaced in one statement where `alter type ... add value` cannot run in a
-- transaction and can never remove a value. Widen them here and in
-- lib/partner-jobs/types.ts together.

-- ---------------------------------------------------------------------------
-- partner_companies — one row per print company. `slug` is the stable public
-- handle a subdomain maps onto (zazaorders.tdstudiosny.com -> 'zaza', see
-- lib/partner-jobs/routing.ts); `job_prefix` + `next_job_number` are that
-- company's private job-number counter (see assign_design_job_number below).
-- ---------------------------------------------------------------------------
create table if not exists public.partner_companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  -- 2-6 uppercase letters, e.g. 'ZA' -> ZA-1001. Unique so two companies can
  -- never mint the same human-readable job number.
  job_prefix      text not null unique check (job_prefix ~ '^[A-Z]{2,6}$'),
  next_job_number bigint not null default 1001 check (next_job_number > 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger partner_companies_set_updated_at
  before update on public.partner_companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- partner_users — maps a Supabase auth user to exactly one partner company.
-- `user_id` is UNIQUE for the same reason client_users.user_id is: one person,
-- one partner workspace. Revoking access is `active = false`, which keeps the
-- row (and therefore the submitted_by attribution on their jobs) intact.
-- ---------------------------------------------------------------------------
create table if not exists public.partner_users (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  company_id   uuid not null references public.partner_companies (id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 120),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists partner_users_company_id_idx on public.partner_users (company_id);

create trigger partner_users_set_updated_at
  before update on public.partner_users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- design_jobs — one submitted job. `job_number` is assigned by the trigger
-- below and is never accepted from the client.
-- ---------------------------------------------------------------------------
create table if not exists public.design_jobs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.partner_companies (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null default auth.uid(),
  job_number   text not null unique check (job_number ~ '^[A-Z]{2,6}-[0-9]{3,}$'),
  job_name     text not null check (length(btrim(job_name)) between 1 and 160),
  status       text not null default 'new'
    check (status in ('new', 'in_progress', 'completed')),
  notes        text check (notes is null or length(notes) <= 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The partner dashboard and the admin list are both "newest first, by company".
create index if not exists design_jobs_company_created_idx
  on public.design_jobs (company_id, created_at desc);
create index if not exists design_jobs_created_at_idx
  on public.design_jobs (created_at desc);

create trigger design_jobs_set_updated_at
  before update on public.design_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- design_job_items — a job holds several products; a rep should never have to
-- file one job per product. Quantity is per item.
-- ---------------------------------------------------------------------------
create table if not exists public.design_job_items (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.design_jobs (id) on delete cascade,
  product_type text not null check (product_type in (
    'eighth_bag', 'seven_gram_bag', 'two_in_one_bag', 'pound_bag',
    'jar_100ml', 'jar_150ml'
  )),
  finish       text not null check (finish in ('matte', 'spot_gloss')),
  -- Positive by requirement; the ceiling is a sanity bound, not a business rule.
  quantity     integer not null check (quantity between 1 and 10000000),
  created_at   timestamptz not null default now()
);

create index if not exists design_job_items_job_id_idx on public.design_job_items (job_id);

-- ---------------------------------------------------------------------------
-- design_job_files — metadata for an object in the private partner-job-files
-- bucket. Bytes are never served by raw object URL: downloads go through
-- app/api/partner-job-files/[fileId]/route.ts, which authorizes and then mints
-- a 60-second signed URL.
-- ---------------------------------------------------------------------------
create table if not exists public.design_job_files (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.design_jobs (id) on delete cascade,
  storage_path      text not null unique check (length(storage_path) between 1 and 500),
  original_filename text not null check (length(btrim(original_filename)) between 1 and 200),
  mime_type         text check (mime_type is null or length(mime_type) <= 160),
  file_size         bigint not null check (file_size > 0),
  uploaded_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);

create index if not exists design_job_files_job_id_idx on public.design_job_files (job_id);

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER + fixed search_path, exactly like
-- portal_client_id() / is_portal_user() in 0003, so the policies below can read
-- partner_users without recursing through its own RLS.
--
-- BOTH `active` flags are checked here rather than in each policy, so
-- deactivating a company or a rep instantly removes every grant they had — the
-- single place that decides "is this caller a partner, and of whom".
-- ---------------------------------------------------------------------------
create or replace function public.partner_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pu.company_id
    from public.partner_users pu
    join public.partner_companies pc on pc.id = pu.company_id
   where pu.user_id = auth.uid()
     and pu.active
     and pc.active
   limit 1;
$$;

create or replace function public.is_partner_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.partner_company_id() is not null;
$$;

comment on function public.partner_company_id() is
  'The partner company the caller may read and write, or null. Active membership AND active company are both required.';

-- ---------------------------------------------------------------------------
-- Human-readable job numbers (ZA-1001, ZA-1002, ...).
--
-- Race safety: the counter lives on the company row, and `update ... returning`
-- takes a row lock, so two concurrent submissions for the same company
-- serialize on it and get consecutive numbers. `design_jobs.job_number` is
-- UNIQUE as a second line of defence. A per-company counter rather than a
-- global sequence is what lets a new company be added as one row with its own
-- prefix, with no schema change.
--
-- The trigger ALWAYS assigns, overwriting anything supplied, so a job number
-- can never be client-chosen. SECURITY DEFINER because a partner rep has no
-- update policy on partner_companies (and must not have one).
-- ---------------------------------------------------------------------------
create or replace function public.assign_design_job_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_number bigint;
begin
  update public.partner_companies
     set next_job_number = next_job_number + 1
   where id = new.company_id
  returning job_prefix, next_job_number - 1 into v_prefix, v_number;

  if v_prefix is null then
    raise exception 'unknown partner company %', new.company_id
      using errcode = '23503';
  end if;

  new.job_number := v_prefix || '-' || v_number::text;
  return new;
end;
$$;

drop trigger if exists design_jobs_assign_number on public.design_jobs;
create trigger design_jobs_assign_number
  before insert on public.design_jobs
  for each row execute function public.assign_design_job_number();

-- ---------------------------------------------------------------------------
-- create_design_job — the whole submission, in ONE transaction.
--
-- A job, its items and its files are meaningless apart: a job with no items is
-- an empty order, and items with no job are unreachable rows. PostgREST has no
-- multi-statement transaction, so three separate inserts from the server action
-- would leave a window where a failure strands half a submission (the mylar
-- intake lives with exactly that and cleans up by hand afterwards). A function
-- runs in one transaction, so any failure rolls the whole thing back and the
-- only cleanup left is the Storage objects.
--
-- SECURITY INVOKER (the default, stated explicitly because it is load-bearing):
-- every statement inside runs as the caller, so the RLS policies below are what
-- authorize the write. This function grants nothing on its own — it cannot be
-- used to file a job for another company, because the insert's `with check`
-- still has to pass.
-- ---------------------------------------------------------------------------
create or replace function public.create_design_job(
  p_job_id   uuid,
  p_job_name text,
  p_notes    text,
  p_items    jsonb,
  p_files    jsonb
)
returns table (job_id uuid, job_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.partner_company_id();
  v_id      uuid;
  v_number  text;
begin
  if v_company is null then
    raise exception 'not a partner user' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'a job needs at least one product' using errcode = '23514';
  end if;

  insert into public.design_jobs (id, company_id, submitted_by, job_name, notes)
  values (
    coalesce(p_job_id, gen_random_uuid()),
    v_company,
    auth.uid(),
    p_job_name,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning design_jobs.id, design_jobs.job_number into v_id, v_number;

  insert into public.design_job_items (job_id, product_type, finish, quantity)
  select v_id, item.product_type, item.finish, item.quantity
    from jsonb_to_recordset(p_items)
      as item(product_type text, finish text, quantity integer);

  if p_files is not null and jsonb_typeof(p_files) = 'array'
     and jsonb_array_length(p_files) > 0 then
    insert into public.design_job_files
      (job_id, storage_path, original_filename, mime_type, file_size, uploaded_by)
    select v_id, f.storage_path, f.original_filename, f.mime_type, f.file_size, auth.uid()
      from jsonb_to_recordset(p_files)
        as f(storage_path text, original_filename text, mime_type text, file_size bigint);
  end if;

  return query select v_id, v_number;
end;
$$;

-- SECURITY DEFINER functions get EXECUTE for PUBLIC by default; this one is
-- INVOKER, but the same tidiness applies — name the grants explicitly.
revoke all on function public.create_design_job(uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.create_design_job(uuid, text, text, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read the absences here as carefully as the presences: there is no UPDATE and
-- no DELETE policy on ANY of these tables, and no insert policy at all on
-- partner_companies / partner_users. Status changes and membership management
-- are service-role-only operations behind requireAdmin().
-- ---------------------------------------------------------------------------
alter table public.partner_companies enable row level security;
alter table public.partner_users     enable row level security;
alter table public.design_jobs       enable row level security;
alter table public.design_job_items  enable row level security;
alter table public.design_job_files  enable row level security;

-- A rep may read their own company record (the portal renders its name) and
-- their own membership row. Nothing else about either table is visible, so one
-- partner can never enumerate the others.
create policy partner_companies_select_own on public.partner_companies
  for select to authenticated
  using (id = public.partner_company_id());

create policy partner_users_select_self on public.partner_users
  for select to authenticated
  using (user_id = auth.uid());

-- A company may have several reps, and the job detail page names who filed each
-- job — so a rep can read their COLLEAGUES' membership rows too, scoped by the
-- same helper everything else here uses. The row carries a display name, an
-- auth uid and two flags; no email, no credentials, and nothing outside their
-- own company. Without this, "Submitted by" would be blank for every job a rep
-- did not personally file.
create policy partner_users_select_company on public.partner_users
  for select to authenticated
  using (company_id = public.partner_company_id());

-- Jobs: read your company's, file new ones for your company only.
-- `status = 'new'` in the with-check is what stops a rep opening a job that is
-- already marked completed; combined with the absent UPDATE policy, a rep can
-- never influence status at any point in a job's life.
create policy design_jobs_partner_select on public.design_jobs
  for select to authenticated
  using (company_id = public.partner_company_id());

create policy design_jobs_partner_insert on public.design_jobs
  for insert to authenticated
  with check (
    company_id = public.partner_company_id()
    and submitted_by = auth.uid()
    and status = 'new'
  );

-- Items and files inherit the job's company through an exists() on design_jobs,
-- the same shape 0017 used to harden the portal write policies. Checking the
-- parent (rather than trusting job_id) is what stops a rep attaching items or
-- files to another company's job.
create policy design_job_items_partner_select on public.design_job_items
  for select to authenticated
  using (
    exists (
      select 1 from public.design_jobs j
       where j.id = design_job_items.job_id
         and j.company_id = public.partner_company_id()
    )
  );

create policy design_job_items_partner_insert on public.design_job_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.design_jobs j
       where j.id = design_job_items.job_id
         and j.company_id = public.partner_company_id()
    )
  );

create policy design_job_files_partner_select on public.design_job_files
  for select to authenticated
  using (
    exists (
      select 1 from public.design_jobs j
       where j.id = design_job_files.job_id
         and j.company_id = public.partner_company_id()
    )
  );

create policy design_job_files_partner_insert on public.design_job_files
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.design_jobs j
       where j.id = design_job_files.job_id
         and j.company_id = public.partner_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Private Storage bucket for job reference files.
--
-- Object key convention:  {companyId}/{jobId}/{uuid}-{sanitized-name}
-- The FIRST path segment is the company id, which is what the storage policies
-- below match on — the same "first folder is the tenant" convention 0004 uses
-- for client-files, and what makes an orphan sweep a one-line `not exists`.
--
-- 50 MB (not the 25 MB of client-files/design-requests) because these are
-- production print sources — layered PSD, packaged AI, flattened EPS. Bytes go
-- browser -> Storage over a signed upload URL, so neither Next's ~4 MB Server
-- Action body cap nor Vercel's request cap is in the path. Keep in sync with
-- MAX_PARTNER_UPLOAD_BYTES in lib/partner-jobs/uploads.ts.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('partner-job-files', 'partner-job-files', false, 50 * 1024 * 1024)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Unlike the mylar-artwork bucket (service-role only, because its uploader is
-- anonymous) this one has real policies: a partner rep IS authenticated, so the
-- upload can run under their own session and Storage itself enforces the tenant
-- boundary. The server action still builds every path and verifies every object
-- afterwards — this is the layer beneath that, not a replacement for it.
--
-- TD Studios admins are deliberately absent here and reach the bytes through
-- the service-role client, which bypasses RLS.
drop policy if exists "partner_job_files_partner_select" on storage.objects;
create policy "partner_job_files_partner_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'partner-job-files'
  and public.partner_company_id() is not null
  and (storage.foldername(name))[1] = public.partner_company_id()::text
);

drop policy if exists "partner_job_files_partner_insert" on storage.objects;
create policy "partner_job_files_partner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'partner-job-files'
  and public.partner_company_id() is not null
  and (storage.foldername(name))[1] = public.partner_company_id()::text
);

-- ---------------------------------------------------------------------------
-- Seed the first partner company. Idempotent — re-running the migration (or
-- pushing it to an environment that already has Zaza) changes nothing.
--
-- Associating the first sales rep is a separate, manual step: create their
-- Supabase auth user, then insert their partner_users row. See README.
-- ---------------------------------------------------------------------------
insert into public.partner_companies (name, slug, job_prefix)
values ('Zaza', 'zaza', 'ZA')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session), not as the service
-- role, which bypasses RLS and proves nothing.
--
--   -- 1. Membership resolves.
--   select public.partner_company_id(), public.is_partner_user();
--
--   -- 2. They see only their own company's jobs.
--   select count(*) from public.design_jobs;
--
--   -- 3. They cannot change status, delete a job, or join another company
--   --    (all four must affect 0 rows or raise).
--   update public.design_jobs set status = 'completed';
--   delete from public.design_jobs;
--   update public.partner_users set company_id = gen_random_uuid();
--   insert into public.partner_users (user_id, company_id)
--     select auth.uid(), id from public.partner_companies limit 1;
--
--   -- 4. They cannot file a job for another company (must raise 42501).
--   insert into public.design_jobs (company_id, job_name)
--     values (gen_random_uuid(), 'not mine');
--
--   -- 5. A signed-in NON-partner (admin or customer) sees nothing.
--   select count(*) from public.design_jobs;   -- expect 0
-- ---------------------------------------------------------------------------

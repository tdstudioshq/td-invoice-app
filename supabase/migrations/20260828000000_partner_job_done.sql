-- TD Studios — let a partner rep tick a job off as done
--
-- WHY A NEW COLUMN RATHER THAN `status`
-- `status` is the STUDIO's workflow field, and 20260826000000 went out of its
-- way to keep it that way: protect_design_job_columns() forces it back for any
-- caller with an auth.uid(), because RLS `with check` cannot see the OLD row and
-- so cannot express "any column but this one". Widening that to let a rep write
-- `status` would undo the whole of that migration's point, and would also make
-- the two sides fight over one field — the studio moving a job to in_progress
-- would silently un-tick the rep's checkbox.
--
-- So "done" gets its own column. The two answers are independent and neither
-- can overwrite the other:
--
--   partner_done_at   the REP's answer  — "we're finished with this on our end"
--   status            the STUDIO's answer — new / in_progress / completed
--
-- The portal's Done tab is the OR of the two (see isJobDone() in
-- lib/partner-jobs/types.ts): a job the studio completed is done whether or not
-- the rep ticked it, which is why the checkbox renders ticked-and-disabled in
-- that case rather than offering to un-do something it cannot un-do.
--
-- NO POLICY AND NO TRIGGER CHANGE IS NEEDED TO MAKE THIS WRITABLE.
-- design_jobs_partner_update (20260826000000) already grants a rep UPDATE on
-- their own company's jobs, and the trigger forces back only the five columns it
-- names. A column that is not in that list is writable by definition — which is
-- the intended design of that trigger, not a gap in it.
-- ---------------------------------------------------------------------------

alter table public.design_jobs
  add column if not exists partner_done_at timestamptz;

comment on column public.design_jobs.partner_done_at is
  'When the partner rep ticked this job off. NULL = not ticked. The rep''s own '
  'answer, deliberately separate from `status`, which stays the studio''s.';

-- The Done tab and the three status tabs are both "this company's jobs, newest
-- first, narrowed by one field", so the existing (company_id, created_at desc)
-- index already serves them. This one is for the partial reads — counting or
-- listing only the ticked ones — and is partial so it costs nothing for the
-- overwhelmingly common un-ticked row.
create index if not exists design_jobs_company_done_idx
  on public.design_jobs (company_id, partner_done_at desc)
  where partner_done_at is not null;

-- ---------------------------------------------------------------------------
-- The timestamp is server-assigned, like every other one here.
--
-- The column is writable by a rep, so its VALUE is client-supplied unless
-- something normalizes it. Nothing dangerous rides on it — it is display text on
-- the rep's own job — but a job stamped "done in 2031" is a lie the studio would
-- read as truth, so the trigger that already exists to normalize rep writes
-- normalizes this one too: any transition into the done state is stamped now().
-- Clearing it (un-ticking) is left alone, since NULL has no value to forge.
-- ---------------------------------------------------------------------------
create or replace function public.protect_design_job_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, which is how the studio changes
  -- status. Everyone else is a rep and gets the previous values back.
  if auth.uid() is not null then
    new.status       := old.status;
    new.company_id   := old.company_id;
    new.job_number   := old.job_number;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;

    -- Ticking the box is the rep's to do; deciding WHEN is not.
    if new.partner_done_at is distinct from old.partner_done_at
       and new.partner_done_at is not null then
      new.partner_done_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session).
--
--   -- 1. Can tick their own job, and the stamp is now() rather than theirs.
--   update public.design_jobs set partner_done_at = '2031-01-01' where id = '<job id>';
--   select partner_done_at from public.design_jobs where id = '<job id>';  -- ~now()
--
--   -- 2. Can un-tick it.
--   update public.design_jobs set partner_done_at = null where id = '<job id>';
--   select partner_done_at from public.design_jobs where id = '<job id>';  -- null
--
--   -- 3. Ticking still cannot smuggle a status change through with it.
--   update public.design_jobs
--      set partner_done_at = now(), status = 'completed' where id = '<job id>';
--   select status from public.design_jobs where id = '<job id>';           -- unchanged
--
--   -- 4. Cannot tick another company's job (0 rows).
--   update public.design_jobs set partner_done_at = now()
--    where company_id <> public.partner_company_id();
-- ---------------------------------------------------------------------------

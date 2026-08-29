-- TD Studios — ONE shared "complete" state for a partner job
--
-- WHAT CHANGED, AND WHY IT REVERSES 20260828000000
-- That migration gave the rep their own `partner_done_at` column, deliberately
-- separate from the studio's `status`, so the two sides could not overwrite each
-- other. In practice the studio wants the opposite: the admin list and the
-- partner portal should show the SAME answer, so ticking a job complete in
-- either place means it is complete in both.
--
-- So `status` becomes the single source of truth and `partner_done_at` is
-- retired. A rep can now write `status` — but only the two moves a checkbox can
-- actually make:
--
--     anything    -> completed      (tick)
--     completed   -> in_progress    (un-tick)
--
-- Everything else is still forced back. A rep cannot move a job from `new` to
-- `in_progress`, or from `in_progress` back to `new`: that distinction is the
-- studio's alone and stays behind the Status dropdown. Un-ticking lands on
-- `in_progress` rather than `new` because `new` is the one answer that is
-- certainly false about a job somebody has already been working on.
--
-- STILL FORCED BACK, UNCHANGED: company_id, job_number, submitted_by,
-- created_at. A job can still never change hands, be renumbered, or
-- re-attribute itself.
--
-- Disallowed transitions are silently REVERTED, not rejected — the same choice
-- 20260826000000 made, so a legitimate edit to a job's name or products still
-- succeeds while a crafted status change quietly accomplishes nothing.
--
-- `partner_done_at` IS NOT DROPPED HERE. Nothing writes it any more and nothing
-- renders it; it is left in place for a release the way 0024 left the legacy
-- mylar artwork columns. The drop statement is in the trailing comment below.
-- At the time of writing 0 rows had it set, so there is nothing to backfill —
-- the verification query below re-checks that before you drop anything.
-- ---------------------------------------------------------------------------

create or replace function public.protect_design_job_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, which is how the studio writes
  -- anything it likes. Everyone else is a rep and is held to the rules below.
  if auth.uid() is not null then
    -- The checkbox's two moves, and a no-op. Anything else reverts.
    if not (
         new.status = old.status
      or (new.status = 'completed' and old.status is distinct from 'completed')
      or (old.status = 'completed' and new.status = 'in_progress')
    ) then
      new.status := old.status;
    end if;

    new.company_id   := old.company_id;
    new.job_number   := old.job_number;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;

    -- Retired (see the header). Nothing writes it, and a rep may not either —
    -- so a stale client cannot resurrect a second, disagreeing answer.
    new.partner_done_at := old.partner_done_at;
  end if;
  return new;
end;
$$;

comment on column public.design_jobs.partner_done_at is
  'RETIRED by 20260829180000. `status = ''completed''` is now the single shared '
  'answer for both the studio and the partner. Nothing reads or writes this; it '
  'is kept for one release before being dropped.';

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session).
--
--   -- 1. A rep CAN tick a job complete.
--   update public.design_jobs set status = 'completed' where id = '<own job id>';
--   select status from public.design_jobs where id = '<own job id>';   -- completed
--
--   -- 2. A rep CAN un-tick it, landing on in_progress.
--   update public.design_jobs set status = 'in_progress' where id = '<own job id>';
--   select status from public.design_jobs where id = '<own job id>';   -- in_progress
--
--   -- 3. A rep CANNOT move in_progress back to new (silently reverted).
--   update public.design_jobs set status = 'new' where id = '<own job id>';
--   select status from public.design_jobs where id = '<own job id>';   -- in_progress
--
--   -- 4. A rep still CANNOT renumber, re-own or re-attribute a job.
--   update public.design_jobs
--      set company_id = gen_random_uuid(), job_number = 'XX-1' where id = '<own job id>';
--
--   -- 5. A rep can no longer write the retired column.
--   update public.design_jobs set partner_done_at = now() where id = '<own job id>';
--   select partner_done_at from public.design_jobs where id = '<own job id>';  -- unchanged
--
-- ONCE THIS HAS SHIPPED FOR A RELEASE, and this returns 0:
--   select count(*) from public.design_jobs
--    where partner_done_at is not null and status <> 'completed';
-- then:
--   alter table public.design_jobs drop column partner_done_at;
--   drop index if exists design_jobs_company_done_idx;
-- ---------------------------------------------------------------------------

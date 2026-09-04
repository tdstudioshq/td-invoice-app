-- TD Studios — let partner reps set the complete job lifecycle status
--
-- The partner jobs dashboard now exposes a three-state dropdown: New,
-- In Progress, and Complete. The existing UPDATE policy already scopes every
-- write to the caller's own partner company with both USING and WITH CHECK.
-- The remaining blocker is protect_design_job_columns(), whose previous
-- version deliberately allowed only the old Done checkbox's two transitions.
--
-- Status is still constrained by design_jobs_status_check, so the only values
-- a rep can store are `new`, `in_progress`, and `completed`. Ownership,
-- attribution, numbering, and creation time remain immutable here. The
-- service-role/admin path is unchanged because auth.uid() is null there.

create or replace function public.protect_design_job_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null then
    -- `status` is intentionally writable. Its table check constraint limits it
    -- to the same three values the partner dropdown offers.
    new.company_id   := old.company_id;
    new.job_number   := old.job_number;
    new.submitted_by := old.submitted_by;
    new.created_at   := old.created_at;

    -- Retired by 20260829180000. Keep stale clients from resurrecting a second
    -- completion state while the column remains in the table.
    new.partner_done_at := old.partner_done_at;
  end if;
  return new;
end;
$$;

-- Verification after applying, as a signed-in partner:
--
--   update public.design_jobs set status = 'new' where id = '<own job id>';
--   update public.design_jobs set status = 'in_progress' where id = '<own job id>';
--   update public.design_jobs set status = 'completed' where id = '<own job id>';
--   select status from public.design_jobs where id = '<own job id>';
--
-- A job owned by another company still updates zero rows through
-- design_jobs_partner_update, and these values still revert to their old ones:
--
--   update public.design_jobs
--      set company_id = gen_random_uuid(), job_number = 'XX-1'
--    where id = '<own job id>';

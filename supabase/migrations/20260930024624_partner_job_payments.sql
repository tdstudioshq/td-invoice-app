-- TD Studios — payments recorded on partner jobs
--
-- A job-level payment log that BOTH sides write: a rep records "we paid $500
-- by Zelle" from the portal, the studio records what it received from
-- /partner-jobs/[id], and both see the same list and total.
--
-- This is deliberately NOT the invoice `payments` table. That table is the
-- studio's ledger — partners are refused every write to it by
-- assert_not_partner_user() (20260926120000), and loosening that would let a rep
-- change an invoice's balance. This log changes no invoice; it records money
-- that moved, per job, with who recorded it.
--
--   1. `design_job_payments` — company-scoped like every partner table, no
--      `owner_id`; the studio reads and writes it through the service role
--      behind requireAdmin(), exactly as it does design_jobs.
--   2. A BEFORE INSERT trigger derives `company_id` from the job and stamps the
--      recorder from auth.uid(), so neither is caller-chosen.
--   3. Reps may SELECT, INSERT, and DELETE — but only delete entries a rep
--      recorded. A studio entry is not theirs to erase. No UPDATE policy: a
--      mistake is removed and re-entered, and both are on the activity log.
--   4. `payment.recorded` / `payment.removed` join the activity event types.
--
-- `job_id` is ON DELETE RESTRICT, the same call as invoices.design_job_id: a
-- job with money recorded against it keeps its record. Both delete actions turn
-- the resulting 23503 into a sentence.

-- ---------------------------------------------------------------------------
-- 1. The log.
-- ---------------------------------------------------------------------------
create table if not exists public.design_job_payments (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.design_jobs (id) on delete restrict,
  company_id          uuid not null references public.partner_companies (id) on delete cascade,
  amount              numeric(12, 2) not null check (amount > 0 and amount < 10000000),
  paid_on             date not null default current_date,
  -- A `check`, not an enum, so it widens in a transaction. Mirror of
  -- JOB_PAYMENT_METHODS in lib/partner-jobs/types.ts — widen both together.
  method              text not null check (method in (
    'cash', 'zelle', 'cash_app', 'venmo', 'check', 'card', 'bank_transfer', 'other'
  )),
  note                text check (note is null or length(note) <= 500),
  recorded_by         uuid references auth.users (id) on delete set null,
  -- True for rows the studio wrote. Decides who may delete the row.
  recorded_by_studio  boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists design_job_payments_job_idx
  on public.design_job_payments (job_id, paid_on desc, created_at desc);
create index if not exists design_job_payments_company_idx
  on public.design_job_payments (company_id);

-- ---------------------------------------------------------------------------
-- 2. Derived columns.
--
--    SECURITY DEFINER so the job's company is read whatever the caller can see;
--    the INSERT policy's `with check` then compares that DERIVED company to the
--    caller's, so naming another company's job fails the policy rather than
--    being silently filed under it. A caller with an auth.uid() is always a
--    rep here (admins write through the service role), so the recorder and the
--    studio flag are forced for them; the service role keeps what it sent.
-- ---------------------------------------------------------------------------
create or replace function public.design_job_payments_derive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select j.company_id into new.company_id
    from public.design_jobs j
   where j.id = new.job_id;
  if new.company_id is null then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if auth.uid() is not null then
    new.recorded_by := auth.uid();
    new.recorded_by_studio := false;
  end if;
  return new;
end;
$$;

drop trigger if exists design_job_payments_derive on public.design_job_payments;
create trigger design_job_payments_derive
  before insert on public.design_job_payments
  for each row execute function public.design_job_payments_derive();

-- ---------------------------------------------------------------------------
-- 3. Access.
-- ---------------------------------------------------------------------------
alter table public.design_job_payments enable row level security;
revoke all on public.design_job_payments from anon;

drop policy if exists design_job_payments_partner_select on public.design_job_payments;
create policy design_job_payments_partner_select on public.design_job_payments
  for select to authenticated
  using (company_id = public.partner_company_id());

drop policy if exists design_job_payments_partner_insert on public.design_job_payments;
create policy design_job_payments_partner_insert on public.design_job_payments
  for insert to authenticated
  with check (
    company_id = public.partner_company_id()
    and recorded_by_studio = false
  );

drop policy if exists design_job_payments_partner_delete on public.design_job_payments;
create policy design_job_payments_partner_delete on public.design_job_payments
  for delete to authenticated
  using (
    company_id = public.partner_company_id()
    and recorded_by_studio = false
  );

-- ---------------------------------------------------------------------------
-- 4. Activity event types. Widen with PARTNER_JOB_EVENT_TYPES
--    (lib/partner-jobs/types.ts) and the lib/types/database.ts mirror.
-- ---------------------------------------------------------------------------
alter table public.partner_job_events
  drop constraint if exists partner_job_events_event_type_check;
alter table public.partner_job_events
  add constraint partner_job_events_event_type_check check (event_type in (
    'job.created',
    'job.updated',
    'job.status_changed',
    'job.done_changed',
    'file.added',
    'file.removed',
    'job.deleted',
    'payment.recorded',
    'payment.removed'
  ));

-- ---------------------------------------------------------------------------
-- VERIFICATION — as the REP (anon key + their session), never the service role.
--
--   -- 1. Recording on your own job works and derives the company + recorder.
--   insert into public.design_job_payments (job_id, amount, method)
--     values ('<own job id>', 50, 'zelle')
--     returning company_id, recorded_by, recorded_by_studio;
--
--   -- 2. Another company's job is refused (42501 from the trigger, or the
--   --    policy's with check).
--   insert into public.design_job_payments (job_id, amount, method)
--     values ('<other company job id>', 50, 'zelle');
--
--   -- 3. Claiming to be the studio does not stick — recorded_by_studio comes
--   --    back false.
--   insert into public.design_job_payments (job_id, amount, method, recorded_by_studio)
--     values ('<own job id>', 1, 'cash', true) returning recorded_by_studio;
--
--   -- 4. A studio-recorded row cannot be deleted by the rep (0 rows).
--   delete from public.design_job_payments where recorded_by_studio;
--
--   -- 5. No update path at all (0 rows).
--   update public.design_job_payments set amount = 1;
-- ---------------------------------------------------------------------------

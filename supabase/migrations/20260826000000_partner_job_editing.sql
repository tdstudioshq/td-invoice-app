-- TD Studios — let partner reps edit their own jobs
--
-- 20260825120000 deliberately gave the partner tables NO update and NO delete
-- policy: a filed job was a record. That has been reconsidered — a rep who
-- fat-fingers a quantity or attaches the wrong artwork should fix it themselves
-- rather than text the studio, which is the whole point of the portal. This
-- migration opens exactly that, and nothing more.
--
-- WHAT STAYS SHUT, AND IS NOW ENFORCED HARDER THAN BEFORE
-- `status` is the studio's workflow field, not the customer's. A rep still
-- cannot move a job to in_progress or completed — but where that used to be a
-- consequence of having no UPDATE policy at all, it now needs saying out loud,
-- because an UPDATE policy exists. RLS `with check` cannot see the OLD row, so
-- a policy cannot express "any column but this one". A trigger can, and does:
-- for any caller with an auth.uid() (i.e. a rep) the immutable columns are
-- forced back to their previous values rather than rejected, so a legitimate
-- edit still succeeds and a crafted one silently accomplishes nothing.
-- The service role has no auth.uid(), so the admin status write is unaffected.
--
-- Immutable to reps: status, company_id, job_number, submitted_by, created_at.
-- A job can therefore never change hands, be renumbered, or re-attribute itself.

-- ---------------------------------------------------------------------------
-- 1. Column immutability for rep-side updates.
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
  end if;
  return new;
end;
$$;

drop trigger if exists design_jobs_protect_columns on public.design_jobs;
create trigger design_jobs_protect_columns
  before update on public.design_jobs
  for each row execute function public.protect_design_job_columns();

-- ---------------------------------------------------------------------------
-- 2. Policies. Every one is scoped by partner_company_id(), the same helper the
--    select/insert policies use, so a rep still only ever reaches their own
--    company's rows — the boundary is unchanged, only the verbs are wider.
-- ---------------------------------------------------------------------------
create policy design_jobs_partner_update on public.design_jobs
  for update to authenticated
  using (company_id = public.partner_company_id())
  with check (company_id = public.partner_company_id());

create policy design_jobs_partner_delete on public.design_jobs
  for delete to authenticated
  using (company_id = public.partner_company_id());

-- Items are replaced wholesale on save (delete-then-insert inside
-- update_design_job below), so they need delete as well as the existing insert.
create policy design_job_items_partner_update on public.design_job_items
  for update to authenticated
  using (
    exists (select 1 from public.design_jobs j
             where j.id = design_job_items.job_id
               and j.company_id = public.partner_company_id())
  )
  with check (
    exists (select 1 from public.design_jobs j
             where j.id = design_job_items.job_id
               and j.company_id = public.partner_company_id())
  );

create policy design_job_items_partner_delete on public.design_job_items
  for delete to authenticated
  using (
    exists (select 1 from public.design_jobs j
             where j.id = design_job_items.job_id
               and j.company_id = public.partner_company_id())
  );

create policy design_job_files_partner_delete on public.design_job_files
  for delete to authenticated
  using (
    exists (select 1 from public.design_jobs j
             where j.id = design_job_files.job_id
               and j.company_id = public.partner_company_id())
  );

-- ---------------------------------------------------------------------------
-- 3. Storage. Removing a file has to remove the OBJECT too, or the bucket fills
--    with bytes no row references. Same first-path-segment rule as the existing
--    select/insert policies, so a rep can only ever delete inside their own
--    company's prefix.
-- ---------------------------------------------------------------------------
drop policy if exists "partner_job_files_partner_delete" on storage.objects;
create policy "partner_job_files_partner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'partner-job-files'
  and public.partner_company_id() is not null
  and (storage.foldername(name))[1] = public.partner_company_id()::text
);

-- ---------------------------------------------------------------------------
-- 4. update_design_job — the edit, in ONE transaction.
--
--    Same reasoning as create_design_job: a job and its items are meaningless
--    apart, and replacing the item set is a delete plus an insert. Through
--    PostgREST those are two round trips with a window in between where the job
--    has no products at all. One SECURITY INVOKER function is one transaction,
--    so the job never exists in that state and a failure rolls back cleanly.
--
--    INVOKER is load-bearing: every statement inside runs as the caller, so the
--    policies above are what authorize the edit. The function grants nothing.
-- ---------------------------------------------------------------------------
create or replace function public.update_design_job(
  p_job_id   uuid,
  p_job_name text,
  p_notes    text,
  p_items    jsonb
)
returns table (job_id uuid, job_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid := public.partner_company_id();
  v_number  text;
begin
  if v_company is null then
    raise exception 'not a partner user' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'a job needs at least one product' using errcode = '23514';
  end if;

  update public.design_jobs
     set job_name = p_job_name,
         notes    = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_job_id
  returning design_jobs.job_number into v_number;

  -- RLS hid the row, or it does not exist. Either way the caller may not edit it.
  if v_number is null then
    raise exception 'job not found' using errcode = '42501';
  end if;

  delete from public.design_job_items where design_job_items.job_id = p_job_id;

  insert into public.design_job_items (job_id, product_type, finish, quantity)
  select p_job_id, item.product_type, item.finish, item.quantity
    from jsonb_to_recordset(p_items)
      as item(product_type text, finish text, quantity integer);

  return query select p_job_id, v_number;
end;
$$;

revoke all on function public.update_design_job(uuid, text, text, jsonb) from public;
grant execute on function public.update_design_job(uuid, text, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session).
--
--   -- 1. Can edit their own job's name/notes/items.
--   select * from public.update_design_job(
--     '<job id>', 'renamed', 'new notes',
--     '[{"product_type":"pound_bag","finish":"matte","quantity":5}]'::jsonb);
--
--   -- 2. Cannot change status, however it is attempted (both must leave it be).
--   update public.design_jobs set status = 'completed' where id = '<job id>';
--   select status from public.design_jobs where id = '<job id>';  -- unchanged
--
--   -- 3. Cannot move a job to another company or renumber it.
--   update public.design_jobs set company_id = gen_random_uuid(), job_number = 'XX-1';
--   select company_id, job_number from public.design_jobs;         -- unchanged
--
--   -- 4. Cannot touch another company's job (0 rows).
--   update public.design_jobs set job_name = 'x' where company_id <> public.partner_company_id();
--   delete from public.design_jobs where company_id <> public.partner_company_id();
-- ---------------------------------------------------------------------------

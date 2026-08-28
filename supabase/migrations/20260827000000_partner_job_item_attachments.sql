-- TD Studios — per-product notes and artwork on a partner design job
--
-- 20260825120000 modelled a job as: one job, N products, and one flat pile of
-- files plus one notes box shared by the whole job. That was wrong in practice.
-- A rep files "Summer Run" with an 8th bag, a pound bag and a 100ml jar, and the
-- artwork and the instructions are PER PRODUCT — "matte on the jar, the darker
-- green on the pound bag". With one shared pile the studio had to guess which
-- file belonged to which product, which is exactly the guessing the portal was
-- built to stop.
--
-- WHAT CHANGES
--   design_job_items  gains `notes` and `item_number`
--   design_job_files  gains a nullable `item_id`
--
-- WHY item_id IS NULLABLE, AND STAYS NULLABLE
-- Every file filed before this migration belongs to the job, not to any one
-- product — there was no product to belong to. Null means exactly that, and the
-- job views render those under "Job files" rather than inventing an owner for
-- them. It is a real state, not a backfill we neglected to finish, so nothing
-- here tries to guess. New submissions always set it.
--
-- WHY ITEM IDS ARE NOW MINTED IN THE BROWSER
-- A file points at an item, so an item needs an identity that survives an edit.
-- The old update_design_job replaced the item set wholesale (delete-then-insert)
-- which was fine while items were anonymous rows and fatal the moment anything
-- references them: `on delete cascade` would take every per-product file with it
-- on a rename. So the client mints each item's uuid, exactly as the mylar wizard
-- mints a design's (see the 0024 migration and CLAUDE.md), and the update below
-- reconciles by id instead of replacing.
--
-- That id is safe to accept for the same reason it is there: it is the id the
-- file was attached under. A forged one can only reach rows RLS already lets the
-- caller reach, and the guard in update_design_job refuses an id belonging to a
-- different job of theirs.
--
-- WHY item_number IS STORED RATHER THAN DERIVED
-- Same reasoning as mylar's `design_number`. Ordering by `created_at` was only
-- ever stable because items were inserted together; once a rep can add a product
-- to a filed job, "Item 2" has to keep meaning the same product to the rep, the
-- studio, and the notes that reference it.

-- ---------------------------------------------------------------------------
-- 1. Columns.
-- ---------------------------------------------------------------------------
alter table public.design_job_items
  add column if not exists notes text
    check (notes is null or length(notes) <= 2000),
  add column if not exists item_number integer not null default 1
    check (item_number >= 1);

alter table public.design_job_files
  add column if not exists item_id uuid
    references public.design_job_items (id) on delete cascade;

-- The job views fetch a job's files and group them by product, and the cascade
-- above needs it too.
create index if not exists design_job_files_item_id_idx
  on public.design_job_files (item_id);

-- Existing items were inserted in one statement, so created_at order IS the
-- order the rep typed them in. Freeze that into item_number before anything
-- starts depending on it.
with numbered as (
  select id, row_number() over (
           partition by job_id order by created_at, id
         ) as n
    from public.design_job_items
)
update public.design_job_items i
   set item_number = numbered.n
  from numbered
 where numbered.id = i.id
   and i.item_number is distinct from numbered.n;

-- ---------------------------------------------------------------------------
-- 2. create_design_job — now carries per-item notes/number and per-file owner.
--
--    Same signature as before (uuid, text, text, jsonb, jsonb), so this is a
--    plain `create or replace` with no drop and no grant churn. Still SECURITY
--    INVOKER: every statement inside runs as the caller, so the RLS policies are
--    what authorize the write and this function grants nothing.
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

  insert into public.design_job_items
    (id, job_id, product_type, finish, quantity, notes, item_number)
  select coalesce(item.id, gen_random_uuid()),
         v_id,
         item.product_type,
         item.finish,
         item.quantity,
         nullif(btrim(coalesce(item.notes, '')), ''),
         coalesce(item.item_number, 1)
    from jsonb_to_recordset(p_items)
      as item(id uuid, product_type text, finish text, quantity integer,
              notes text, item_number integer);

  if p_files is not null and jsonb_typeof(p_files) = 'array'
     and jsonb_array_length(p_files) > 0 then
    -- A file may name only a product that is on THIS job. The foreign key alone
    -- would happily accept an item id from another job (or another company's,
    -- were it visible), which would file artwork against somebody else's
    -- product. Checked here rather than in the action because this is the
    -- transaction — the action's copy of this rule is for the error message.
    if exists (
      select 1
        from jsonb_to_recordset(p_files) as f(item_id uuid)
       where f.item_id is not null
         and not exists (
           select 1 from public.design_job_items i
            where i.id = f.item_id and i.job_id = v_id
         )
    ) then
      raise exception 'a file names a product that is not on this job'
        using errcode = '23503';
    end if;

    insert into public.design_job_files
      (job_id, item_id, storage_path, original_filename, mime_type, file_size, uploaded_by)
    select v_id, f.item_id, f.storage_path, f.original_filename,
           f.mime_type, f.file_size, auth.uid()
      from jsonb_to_recordset(p_files)
        as f(item_id uuid, storage_path text, original_filename text,
             mime_type text, file_size bigint);
  end if;

  return query select v_id, v_number;
end;
$$;

revoke all on function public.create_design_job(uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.create_design_job(uuid, text, text, jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. update_design_job — reconcile the item set instead of replacing it.
--
--    The old body was `delete from design_job_items where job_id = ...` followed
--    by an insert. With design_job_files.item_id cascading, that would delete
--    every per-product file on the job every time a rep fixed a typo. So items
--    are now matched by id: gone ones are deleted (and their files go with them,
--    which is what removing a product should mean), surviving ones are updated
--    in place, and new ones are inserted.
--
--    Signature is unchanged, so this too is a plain create-or-replace.
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

  -- An id that already exists on a DIFFERENT job is refused outright. A brand
  -- new uuid (a product just added) matches nothing here and falls through to
  -- the insert below, which is the intended path. RLS keeps another company's
  -- rows invisible, so this only has to police the caller's own jobs.
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(id uuid)
      join public.design_job_items i on i.id = item.id
     where i.job_id <> p_job_id
  ) then
    raise exception 'that product belongs to another job' using errcode = '23503';
  end if;

  -- Products the rep removed. Their files go by cascade; the storage OBJECTS do
  -- not, so the action collects those keys before calling this and deletes them
  -- afterwards (same split as deletePartnerJobAction).
  delete from public.design_job_items i
   where i.job_id = p_job_id
     and not exists (
       select 1 from jsonb_to_recordset(p_items) as item(id uuid)
        where item.id = i.id
     );

  insert into public.design_job_items
    (id, job_id, product_type, finish, quantity, notes, item_number)
  select coalesce(item.id, gen_random_uuid()),
         p_job_id,
         item.product_type,
         item.finish,
         item.quantity,
         nullif(btrim(coalesce(item.notes, '')), ''),
         coalesce(item.item_number, 1)
    from jsonb_to_recordset(p_items)
      as item(id uuid, product_type text, finish text, quantity integer,
              notes text, item_number integer)
  on conflict (id) do update
     set product_type = excluded.product_type,
         finish       = excluded.finish,
         quantity     = excluded.quantity,
         notes        = excluded.notes,
         item_number  = excluded.item_number
   -- Belt and braces behind the guard above: an on-conflict update can never
   -- reach a row on another job.
   where design_job_items.job_id = p_job_id;

  return query select p_job_id, v_number;
end;
$$;

revoke all on function public.update_design_job(uuid, text, text, jsonb) from public;
grant execute on function public.update_design_job(uuid, text, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session).
--
--   -- 1. Legacy files kept their "belongs to the job, not a product" state.
--   select count(*) from public.design_job_files where item_id is null;
--
--   -- 2. Item numbers are 1..n per job with no gaps or duplicates.
--   select job_id, count(*), count(distinct item_number), min(item_number), max(item_number)
--     from public.design_job_items group by job_id
--    having count(*) <> count(distinct item_number) or min(item_number) <> 1;
--
--   -- 3. Editing a job does NOT drop its per-product files (the whole point).
--   --    Note the item id being passed back unchanged.
--   select * from public.update_design_job(
--     '<job id>', 'renamed', null,
--     '[{"id":"<existing item id>","product_type":"pound_bag","finish":"matte",
--        "quantity":5,"notes":"darker green","item_number":1}]'::jsonb);
--   select count(*) from public.design_job_files where job_id = '<job id>';  -- unchanged
--
--   -- 4. A product from another of the rep's own jobs is refused (23503).
--   select * from public.update_design_job(
--     '<job A id>', 'x', null,
--     '[{"id":"<item id from job B>","product_type":"pound_bag","finish":"matte","quantity":1}]'::jsonb);
--
--   -- 5. A file naming a product that is not on the job is refused (23503).
--   select * from public.create_design_job(
--     gen_random_uuid(), 'x', null,
--     '[{"id":"11111111-1111-1111-1111-111111111111","product_type":"pound_bag",
--        "finish":"matte","quantity":1,"item_number":1}]'::jsonb,
--     '[{"item_id":"22222222-2222-2222-2222-222222222222","storage_path":"a",
--        "original_filename":"a.pdf","mime_type":"application/pdf","file_size":1}]'::jsonb);
--
--   -- 6. Status is still immutable to reps (the 20260826000000 trigger).
--   update public.design_jobs set status = 'completed' where id = '<job id>';
--   select status from public.design_jobs where id = '<job id>';  -- unchanged
-- ---------------------------------------------------------------------------

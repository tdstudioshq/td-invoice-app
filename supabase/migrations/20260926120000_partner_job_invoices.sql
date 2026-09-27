-- TD Studios — invoices on partner jobs, and the TNT portal
--
-- A partner company can now have its design jobs invoiced. The invoice is a
-- REAL `invoices` row (TD-INV numbering, line items, the totals triggers, the
-- PDF, the Record Payment dialog) linked to the job it bills, rather than a
-- second, lighter ledger that would drift from the first. Five pieces:
--
--   1. `partner_companies.invoices_enabled` + `client_id` — which companies see
--      an Invoices section, and which `clients` row stands for the company on
--      its invoices. Zaza keeps the default (off), so its portal is unchanged.
--   2. `invoices.design_job_id` — the job an invoice bills. `on delete
--      restrict`: a rep may delete their own jobs, and silently unlinking an
--      invoice with recorded money on it would lose the record of what it was
--      for. The job has to be unlinked from the studio side first.
--   3. `payments.kind` — deposit vs payment. Both reduce the balance the same
--      way; the kind is what the invoice and the portal label them as.
--   4. READ-ONLY partner access to the invoices on their own jobs. Additive
--      SELECT policies only; no owner-scoped policy is modified. Partners are
--      additionally refused any write to invoices / invoice_items / payments by
--      a trigger, because the owner-scoped INSERT policies (0002/20260824193000)
--      accept any authenticated caller writing rows under their own uid — and
--      since SELECT policies are OR'd, a row a rep forged under their own uid
--      would show up in their own invoice view.
--   5. `admin_create_design_job` / `admin_update_design_job` — the studio can
--      now file and edit jobs (and their files) for a company. The partner RPCs
--      derive the company from `partner_company_id()`, which is null for the
--      service role, so the studio gets its own pair taking the company id
--      explicitly. service_role only.
--
-- Plus the TNT company row. Its shared portal account's `partner_users` row is
-- a manual step, exactly as Zaza's was (see README).

-- ---------------------------------------------------------------------------
-- 1. Which companies are invoiced, and as which client.
-- ---------------------------------------------------------------------------
alter table public.partner_companies
  add column if not exists invoices_enabled boolean not null default false,
  add column if not exists client_id uuid references public.clients (id) on delete set null;

comment on column public.partner_companies.invoices_enabled is
  'Whether the portal shows invoices on this company''s jobs.';
comment on column public.partner_companies.client_id is
  'The clients row this company is invoiced as. Set by the studio on first invoice.';

-- ---------------------------------------------------------------------------
-- 2. The job an invoice bills.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists design_job_id uuid
    references public.design_jobs (id) on delete restrict;

create index if not exists invoices_design_job_id_idx
  on public.invoices (design_job_id)
  where design_job_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Deposit vs payment. A `check`, not an enum, so it widens in a transaction
--    (the same reason design_job_items.product_type is one).
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists kind text not null default 'payment';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_kind_check'
  ) then
    alter table public.payments
      add constraint payments_kind_check check (kind in ('deposit', 'payment'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4a. Partners may not write the invoicing tables at all.
--
--     is_partner_user() is SECURITY DEFINER and false for the service role (no
--     auth.uid()) and for every admin, so only a signed-in rep is refused.
-- ---------------------------------------------------------------------------
create or replace function public.assert_not_partner_user()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.is_partner_user() then
    raise exception 'partner users cannot write invoices' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assert_not_partner on public.invoices;
create trigger invoices_assert_not_partner
  before insert or update or delete on public.invoices
  for each row execute function public.assert_not_partner_user();

drop trigger if exists invoice_items_assert_not_partner on public.invoice_items;
create trigger invoice_items_assert_not_partner
  before insert or update or delete on public.invoice_items
  for each row execute function public.assert_not_partner_user();

drop trigger if exists payments_assert_not_partner on public.payments;
create trigger payments_assert_not_partner
  before insert or update or delete on public.payments
  for each row execute function public.assert_not_partner_user();

-- ---------------------------------------------------------------------------
-- 4b. Read access for a rep: the non-draft invoices on their own company's
--     jobs, when that company is invoiced. Drafts stay the studio's, the same
--     rule the client portal follows (0003).
--
--     SECURITY DEFINER so the check is one predicate that does not depend on
--     how the caller's RLS happens to read design_jobs / partner_companies.
-- ---------------------------------------------------------------------------
create or replace function public.partner_can_view_invoice(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.invoices i
      join public.design_jobs j on j.id = i.design_job_id
      join public.partner_companies pc on pc.id = j.company_id
     where i.id = p_invoice_id
       and i.status <> 'draft'
       and pc.invoices_enabled
       and j.company_id = public.partner_company_id()
  );
$$;

-- The clients row the caller's company is invoiced as, or null.
create or replace function public.partner_invoice_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pc.client_id
    from public.partner_companies pc
   where pc.id = public.partner_company_id()
     and pc.invoices_enabled;
$$;

revoke all on function public.partner_can_view_invoice(uuid) from public;
grant execute on function public.partner_can_view_invoice(uuid) to authenticated, service_role;
revoke all on function public.partner_invoice_client_id() from public;
grant execute on function public.partner_invoice_client_id() to authenticated, service_role;

drop policy if exists invoices_partner_select on public.invoices;
create policy invoices_partner_select on public.invoices
  for select to authenticated
  using (design_job_id is not null and public.partner_can_view_invoice(id));

drop policy if exists invoice_items_partner_select on public.invoice_items;
create policy invoice_items_partner_select on public.invoice_items
  for select to authenticated
  using (public.partner_can_view_invoice(invoice_id));

drop policy if exists payments_partner_select on public.payments;
create policy payments_partner_select on public.payments
  for select to authenticated
  using (public.partner_can_view_invoice(invoice_id));

-- The company's own client row, so the invoice (and its PDF) can name who it
-- bills. Same exposure the client portal already has on its own row (0003).
drop policy if exists clients_partner_select on public.clients;
create policy clients_partner_select on public.clients
  for select to authenticated
  using (id = (select public.partner_invoice_client_id()));

-- ---------------------------------------------------------------------------
-- 5. Studio-side job writes. SECURITY INVOKER and granted to service_role
--    only: the service role bypasses RLS, so every company check the partner
--    path gets from its policies is written out explicitly here instead.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_design_job(
  p_company_id uuid,
  p_job_id     uuid,
  p_job_name   text,
  p_notes      text,
  p_items      jsonb,
  p_files      jsonb,
  p_actor      uuid
)
returns table (job_id uuid, job_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id     uuid;
  v_number text;
begin
  if not exists (
    select 1 from public.partner_companies
     where id = p_company_id and active
  ) then
    raise exception 'partner company not found' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'a job needs at least one product' using errcode = '23514';
  end if;

  insert into public.design_jobs (id, company_id, submitted_by, job_name, notes)
  values (
    coalesce(p_job_id, gen_random_uuid()),
    p_company_id,
    p_actor,
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
           f.mime_type, f.file_size, p_actor
      from jsonb_to_recordset(p_files)
        as f(item_id uuid, storage_path text, original_filename text,
             mime_type text, file_size bigint);
  end if;

  return query select v_id, v_number;
end;
$$;

create or replace function public.admin_update_design_job(
  p_company_id uuid,
  p_job_id     uuid,
  p_job_name   text,
  p_notes      text,
  p_items      jsonb
)
returns table (job_id uuid, job_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_number text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'a job needs at least one product' using errcode = '23514';
  end if;

  -- The company filter stands in for the RLS the partner path relies on.
  update public.design_jobs
     set job_name = p_job_name,
         notes    = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_job_id
     and company_id = p_company_id
  returning design_jobs.job_number into v_number;

  if v_number is null then
    raise exception 'job not found' using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_items) as item(id uuid)
      join public.design_job_items i on i.id = item.id
     where i.job_id <> p_job_id
  ) then
    raise exception 'that product belongs to another job' using errcode = '23503';
  end if;

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
   where design_job_items.job_id = p_job_id;

  return query select p_job_id, v_number;
end;
$$;

revoke all on function public.admin_create_design_job(uuid, uuid, text, text, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_create_design_job(uuid, uuid, text, text, jsonb, jsonb, uuid)
  to service_role;
revoke all on function public.admin_update_design_job(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_update_design_job(uuid, uuid, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- TNT. `client_id` is left null on purpose: the first invoice created from a
-- TNT job resolves (or creates) the owner-scoped clients row and records it
-- here, since a migration has no workspace owner to create it under.
-- ---------------------------------------------------------------------------
insert into public.partner_companies (name, slug, job_prefix, invoices_enabled)
values ('TNT', 'tnt', 'TNT', true)
on conflict (slug) do update set invoices_enabled = true;

-- ---------------------------------------------------------------------------
-- VERIFICATION — as the TNT rep (their own session), never the service role:
--
--   select id, invoice_number, status from public.invoices;
--     -- only non-draft invoices linked to TNT jobs
--   insert into public.payments (invoice_id, amount) values ('<visible id>', 1);
--     -- ERROR 42501 partner users cannot write invoices
--   select * from public.clients;   -- exactly TNT's own client row
--
-- As the Zaza rep: all three return no rows / the same 42501, since
-- invoices_enabled is false for Zaza.
-- ---------------------------------------------------------------------------

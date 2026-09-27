-- TD Studios — tighten what a partner may see of a job's invoice
--
-- 20260926120000 let a rep read the non-draft invoices on their company's
-- jobs through partner_can_view_invoice(), keyed on the job link alone. But the
-- owner-scoped INSERT policies on invoices / invoice_items / payments accept
-- ANY authenticated caller writing rows under their own uid (only portal users
-- are excluded there, and partners by the trigger in 20260926120000) — so a
-- self-signup customer who somehow held a TNT job or invoice id could plant an
-- invoice or payment row that the rep's portal would then display. Guessing a
-- v4 uuid is not practical; this closes it anyway, in the database.
--
-- The rule becomes: a partner sees an invoice only when it bills the company's
-- own client AND was written by that client's owner (the workspace), and sees a
-- line item / payment only when it was written by the invoice's owner. Nothing
-- the studio writes changes: every studio write already carries the workspace
-- owner id on the client, the invoice and its children alike.
--
-- Function signatures are unchanged, so the existing policies and grants from
-- 20260926120000 keep working; only the two child policies are recreated.

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
      join public.clients c on c.id = pc.client_id
     where i.id = p_invoice_id
       and i.status <> 'draft'
       and pc.invoices_enabled
       and j.company_id = public.partner_company_id()
       and i.client_id = pc.client_id
       and i.owner_id is not distinct from c.owner_id
  );
$$;

-- A line item or payment is shown only when its writer is the invoice's owner.
create or replace function public.partner_can_view_invoice_row(
  p_invoice_id uuid,
  p_owner_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.partner_can_view_invoice(p_invoice_id)
     and exists (
       select 1 from public.invoices i
        where i.id = p_invoice_id
          and i.owner_id is not distinct from p_owner_id
     );
$$;

revoke all on function public.partner_can_view_invoice_row(uuid, uuid) from public;
grant execute on function public.partner_can_view_invoice_row(uuid, uuid)
  to authenticated, service_role;

drop policy if exists invoice_items_partner_select on public.invoice_items;
create policy invoice_items_partner_select on public.invoice_items
  for select to authenticated
  using (public.partner_can_view_invoice_row(invoice_id, owner_id));

drop policy if exists payments_partner_select on public.payments;
create policy payments_partner_select on public.payments
  for select to authenticated
  using (public.partner_can_view_invoice_row(invoice_id, owner_id));

-- VERIFICATION — as the TNT rep: a non-draft invoice the studio created on a
-- TNT job is still visible with all its items and payments; a row written
-- under any other uid (insert one as a throwaway customer account pointing at
-- that invoice) is not.

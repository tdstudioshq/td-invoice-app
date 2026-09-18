-- Explicit API permissions; retain portal/partner helpers and public QR RPCs.
-- Non-admin ownership now fails closed. Canonical admin ownership is unchanged.
create or replace function public.current_owner_id() returns uuid
language sql stable security definer set search_path = '' as $$
 select wo.owner_id from public.workspace_owner wo
 where exists (select 1 from public.workspace_admins wa where wa.user_id = auth.uid());
$$;
create or replace function public.is_workspace_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.workspace_admins where user_id = auth.uid());
$$;
revoke all on function public.is_workspace_admin() from public, anon, authenticated;
grant execute on function public.is_workspace_admin() to authenticated, service_role;

-- Prevent direct sequence consumption before a rejected invoice insert.
revoke all on sequence public.invoice_number_seq from public, anon, authenticated;
create or replace function public.next_invoice_number() returns text
language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_workspace_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
   raise exception 'admin required' using errcode = '42501';
 end if;
 return 'TD-INV-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');
end;
$$;
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
set search_path = ''
as $$
declare
  v_service boolean := coalesce(auth.jwt()->>'role', '') = 'service_role';
  v_caller  uuid := auth.uid();
  v_scope   uuid := public.partner_company_id();
  v_company uuid;
  v_number  text;
  v_name    text;
  v_actor   text;
  v_id      uuid;
begin
  if not v_service and (v_caller is null or v_scope is null) then
    raise exception 'not your job' using errcode = '42501';
  end if;
  if p_event_type is null or p_event_type not in (
    'job.created','job.updated','job.status_changed','job.done_changed',
    'file.added','file.removed','job.deleted'
  ) then raise exception 'invalid event type' using errcode = '22023'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object'
     or octet_length(p_metadata::text) > 4096 then
    raise exception 'invalid event payload' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_metadata) e where
    e.key not in ('summary','products','files','filesAdded','filesRemoved','from','to')
    or jsonb_typeof(e.value) not in ('string','number','boolean','null')) then
    raise exception 'invalid event payload' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_metadata) e where
    (e.key in ('products','files','filesAdded','filesRemoved') and
      (jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[0-9]{1,5}$')) or
    (e.key = 'summary' and (jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 1000)) or
    (e.key in ('from','to') and p_event_type not in ('job.status_changed','job.done_changed')) or
    (e.key in ('from','to') and p_event_type = 'job.status_changed' and
       e.value <> 'null'::jsonb and (e.value #>> '{}') not in ('new','in_progress','completed')) or
    (e.key in ('from','to') and p_event_type = 'job.done_changed' and jsonb_typeof(e.value) <> 'boolean')
  ) then raise exception 'invalid event payload' using errcode = '22023'; end if;
  if length(coalesce(p_job_number,'')) > 100 or length(coalesce(p_job_name,'')) > 500 then
    raise exception 'invalid job identity' using errcode = '22023';
  end if;
  if p_job_id is not null then
    select j.company_id, j.job_number, j.job_name
      into v_company, v_number, v_name
      from public.design_jobs j
     where j.id = p_job_id;
  end if;

  if v_company is null then
    -- No live job behind this event. ONLY a deletion is allowed to say so —
    -- everything else must name a job that exists. Same error as the
    -- cross-company refusal below, so the two cannot be told apart.
    if p_event_type is distinct from 'job.deleted' then
      raise exception 'not your job' using errcode = '42501';
    end if;
    -- A deletion must have been recorded by the database trigger. A caller
    -- cannot invent deleted jobs merely by supplying a number and name.
    select id into v_id from public.partner_job_events
    where event_type = 'job.deleted' and job_id is null
      and job_number = p_job_number and job_name = p_job_name
      and ((v_service and actor_user_id is null) or
           (company_id = v_scope and actor_user_id = v_caller))
      and created_at > now() - interval '10 minutes'
    order by created_at desc limit 1;
    if v_id is null then raise exception 'not your job' using errcode = '42501'; end if;
    update public.partner_job_events set metadata = p_metadata where id = v_id;
    return v_id;
  end if;

  -- Trusted service JWTs may act across companies; all users need membership.
  if not v_service and v_company is distinct from v_scope then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if v_service then
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
    -- Only reference a job that actually exists, so the FK holds. A deletion
    -- falls through this to null, which is the intended state: the denormalized
    -- number and name are what identify it from then on.
    case when exists (select 1 from public.design_jobs where id = p_job_id)
         then p_job_id end,
    v_number, v_name,
    p_event_type, v_caller, left(v_actor, 160), coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;


revoke all on function public.current_owner_id() from public, anon, authenticated, service_role;
grant execute on function public.current_owner_id() to authenticated, service_role;
alter function public.current_owner_id() set search_path = '';

revoke all on function public.portal_client_id() from public, anon, authenticated, service_role;
grant execute on function public.portal_client_id() to authenticated, service_role;
alter function public.portal_client_id() set search_path = '';

revoke all on function public.is_portal_user() from public, anon, authenticated, service_role;
grant execute on function public.is_portal_user() to authenticated, service_role;
alter function public.is_portal_user() set search_path = '';

revoke all on function public.portal_can_upload() from public, anon, authenticated, service_role;
grant execute on function public.portal_can_upload() to authenticated, service_role;
alter function public.portal_can_upload() set search_path = '';

revoke all on function public.partner_company_id() from public, anon, authenticated, service_role;
grant execute on function public.partner_company_id() to authenticated, service_role;
alter function public.partner_company_id() set search_path = '';

revoke all on function public.is_partner_user() from public, anon, authenticated, service_role;
grant execute on function public.is_partner_user() to authenticated, service_role;
alter function public.is_partner_user() set search_path = '';

revoke all on function public.clear_must_change_password() from public, anon, authenticated, service_role;
grant execute on function public.clear_must_change_password() to authenticated, service_role;
alter function public.clear_must_change_password() set search_path = '';

revoke all on function public.create_design_job(uuid, text, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_design_job(uuid, text, text, jsonb, jsonb) to authenticated, service_role;
alter function public.create_design_job(uuid, text, text, jsonb, jsonb) set search_path = '';

revoke all on function public.update_design_job(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_design_job(uuid, text, text, jsonb) to authenticated, service_role;
alter function public.update_design_job(uuid, text, text, jsonb) set search_path = '';

revoke all on function public.log_partner_job_event(uuid, text, jsonb, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.log_partner_job_event(uuid, text, jsonb, text, text, text) to authenticated, service_role;
alter function public.log_partner_job_event(uuid, text, jsonb, text, text, text) set search_path = '';

revoke all on function public.list_premade_design_paths() from public, anon, authenticated, service_role;
grant execute on function public.list_premade_design_paths() to service_role;
alter function public.list_premade_design_paths() set search_path = '';

revoke all on function public.resolve_qr_target(text) from public, anon, authenticated, service_role;
grant execute on function public.resolve_qr_target(text) to anon, authenticated, service_role;
alter function public.resolve_qr_target(text) set search_path = '';

revoke all on function public.log_qr_scan(uuid, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.log_qr_scan(uuid, text, text, text, text, text) to anon, authenticated, service_role;
alter function public.log_qr_scan(uuid, text, text, text, text, text) set search_path = '';

revoke all on function public.log_qr_generation(text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.log_qr_generation(text, text, text, jsonb) to anon, authenticated, service_role;
alter function public.log_qr_generation(text, text, text, jsonb) set search_path = '';

revoke all on function public.next_invoice_number() from public, anon, authenticated, service_role;
grant execute on function public.next_invoice_number() to authenticated, service_role;
alter function public.next_invoice_number() set search_path = '';

revoke all on function public.recalc_invoice_totals(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recalc_invoice_totals(uuid) to authenticated, service_role;
alter function public.recalc_invoice_totals(uuid) set search_path = '';

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
alter function public.set_updated_at() set search_path = '';

revoke all on function public.invoice_items_recalc() from public, anon, authenticated, service_role;
alter function public.invoice_items_recalc() set search_path = '';

revoke all on function public.invoices_recalc_on_rate_change() from public, anon, authenticated, service_role;
alter function public.invoices_recalc_on_rate_change() set search_path = '';

revoke all on function public.assert_not_portal_user() from public, anon, authenticated, service_role;
alter function public.assert_not_portal_user() set search_path = '';

revoke all on function public.assert_not_workspace_admin() from public, anon, authenticated, service_role;
alter function public.assert_not_workspace_admin() set search_path = '';

revoke all on function public.assign_design_job_number() from public, anon, authenticated, service_role;
alter function public.assign_design_job_number() set search_path = '';

revoke all on function public.protect_design_job_columns() from public, anon, authenticated, service_role;
alter function public.protect_design_job_columns() set search_path = '';

revoke all on function public.touch_design_job_from_file() from public, anon, authenticated, service_role;
alter function public.touch_design_job_from_file() set search_path = '';

-- Supabase migration/SQL-editor creator. Global PUBLIC default must also go:
-- a schema-specific REVOKE cannot undo a global default grant.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- Future functions require explicit reviewed grants. Inventory other creators in rollout.

-- Record deletion while its identity and ownership still exist. Application
-- event dispatch can attach the same permitted metadata after DELETE commits.
create function public.record_deleted_partner_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 -- Company deletion cascades must not try to insert into the deleted parent.
 if not exists (select 1 from public.partner_companies where id = old.company_id) then return old; end if;
 insert into public.partner_job_events(company_id,job_id,job_number,job_name,event_type,actor_user_id,actor_label)
 values(old.company_id,null,old.job_number,old.job_name,'job.deleted',auth.uid(),
 coalesce((select display_name from public.partner_users where user_id = auth.uid()),'TD Studios'));
 return old;
end;
$$;
revoke all on function public.record_deleted_partner_job() from public, anon, authenticated, service_role;
create trigger design_jobs_record_deletion before delete on public.design_jobs
for each row execute function public.record_deleted_partner_job();

-- No application/mobile caller uses the retired cutline-files bucket. Keep its
-- assets intact but remove the obsolete per-user API allocation capability.
drop policy if exists cutline_files_owner_all on storage.objects;

-- These reviewed helpers reference Supabase's auth.uid()/auth.jwt() names. Keep
-- the path fixed to trusted schemas; application objects remain schema-qualified.
alter function public.current_owner_id() set search_path = public, auth;
alter function public.is_workspace_admin() set search_path = public, auth;
alter function public.next_invoice_number() set search_path = public, auth;
alter function public.portal_client_id() set search_path = public, auth;
alter function public.is_portal_user() set search_path = public, auth;
alter function public.portal_can_upload() set search_path = public, auth;
alter function public.partner_company_id() set search_path = public, auth;
alter function public.is_partner_user() set search_path = public, auth;
alter function public.clear_must_change_password() set search_path = public, auth;
alter function public.assert_not_portal_user() set search_path = public, auth;
alter function public.assert_not_workspace_admin() set search_path = public, auth;
alter function public.protect_design_job_columns() set search_path = public, auth;
alter function public.log_partner_job_event(uuid, text, jsonb, text, text, text) set search_path = public, auth;

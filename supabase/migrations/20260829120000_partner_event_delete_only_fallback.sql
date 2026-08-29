-- TD Studios — narrow the log_partner_job_event() fallback to deletions only
--
-- THE GAP (introduced by 20260829000000, closed here)
-- The function falls back to the caller's own company when the job it names
-- cannot be found. That fallback exists for exactly ONE case: a `job.deleted`
-- event, whose job is genuinely gone by the time it is logged, so its company
-- can only come from the caller and its number/name can only come from the
-- parameters.
--
-- But the fallback was unconditional. A signed-in rep could therefore pass a
-- job id that does not exist together with ANY event type and a made-up job
-- number, and land a fabricated row in their own company's activity log — which
-- also emails the studio. Not a tenant-isolation failure (the row is always
-- attributed to the caller's own company, the actor is still derived from
-- auth.uid(), and reps still cannot read, amend or delete the log), but an
-- audit trail is worth only as much as its resistance to being written to by
-- hand.
--
-- THE FIX: the fallback now requires `p_event_type = 'job.deleted'`. Every other
-- event type must name a job that actually exists. Nothing else changes — a
-- valid event still derives company, actor, number and name from the live job,
-- and the deleted-job audit trail still works exactly as before.
--
-- ONE ERROR, DELIBERATELY, FOR BOTH REFUSALS.
-- "This job is not yours" and "this job does not exist" raise the SAME errcode
-- and the SAME message. Distinguishing them would hand a rep an existence
-- oracle: they could walk job ids and learn which ones are real but belong to
-- somebody else. The two cases are indistinguishable from outside on purpose —
-- do not "improve" either message.
--
-- Applied AFTER 20260829000000 rather than edited into it, since that migration
-- is already in production.
-- ---------------------------------------------------------------------------

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
set search_path = public
as $$
declare
  v_caller  uuid := auth.uid();
  v_scope   uuid := public.partner_company_id();
  v_company uuid;
  v_number  text;
  v_name    text;
  v_actor   text;
  v_id      uuid;
begin
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
    v_company := v_scope;
    v_number  := p_job_number;
    v_name    := p_job_name;
  end if;

  -- A deletion logged by the service role, which belongs to no company: there
  -- is nothing to attribute it to, so it is dropped rather than guessed at.
  if v_company is null then
    return null;
  end if;

  -- A signed-in caller may only ever log against their OWN company. The service
  -- role has no auth.uid() and is the studio, so it is not held to this.
  if v_caller is not null and v_company is distinct from v_scope then
    raise exception 'not your job' using errcode = '42501';
  end if;

  if v_caller is null then
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

-- create or replace keeps the existing grants, but they are restated so this
-- file is complete on its own: never anon, and never PUBLIC (which SECURITY
-- DEFINER functions are granted by default).
revoke all on function public.log_partner_job_event(uuid, text, jsonb, text, text, text) from public;
grant execute on function public.log_partner_job_event(uuid, text, jsonb, text, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- VERIFICATION — run as the REP (anon key + their session).
--
--   -- 1. A real own job still works, and still derives everything.
--   select public.log_partner_job_event('<own job id>', 'job.updated');
--
--   -- 2. A job id that does not exist is now REFUSED for a non-delete (42501).
--   select public.log_partner_job_event(
--     '00000000-0000-4000-8000-000000000000', 'job.created',
--     '{}'::jsonb, 'XX-1', 'forged');
--
--   -- 3. ...but still allowed for a deletion, on the caller's own company.
--   select public.log_partner_job_event(
--     null, 'job.deleted', '{}'::jsonb, 'ZA-1001', 'deleted job');
--
--   -- 4. Another company's REAL job is still refused, with the SAME error (42501).
--   select public.log_partner_job_event('<other company job id>', 'job.updated');
-- ---------------------------------------------------------------------------

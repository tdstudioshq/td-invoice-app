-- Durable counters shared across server instances; no browser grants.
create table public.security_quotas (
 key text primary key, used integer not null, resets_at timestamptz not null
);
alter table public.security_quotas enable row level security;
revoke all on public.security_quotas from public, anon, authenticated;
grant all on public.security_quotas to service_role;
create function public.consume_security_quota(p_key text, p_limit integer, p_seconds integer, p_cost integer default 1)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
 if p_limit < 1 or p_seconds < 1 or p_cost < 1 or length(p_key) > 200 then raise exception 'invalid quota'; end if;
 insert into public.security_quotas values (p_key, p_cost, now() + make_interval(secs => p_seconds))
 on conflict (key) do update set
 used = case when public.security_quotas.resets_at <= now() then p_cost else least(public.security_quotas.used::bigint + p_cost, 2147483647)::integer end,
 resets_at = case when public.security_quotas.resets_at <= now() then now() + make_interval(secs => p_seconds) else public.security_quotas.resets_at end
 returning used into n;
 return n <= p_limit;
end;
$$;
revoke all on function public.consume_security_quota(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_security_quota(text, integer, integer, integer) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
 values ('restricted-galleries','restricted-galleries',false,52428800),
 ('processing','processing',false,125829120),
 ('processing-inputs','processing-inputs',false,31457280)
on conflict (id) do update set public = false;
-- Existing URLs cease being public at cutover. Verify in staging before rollout.
update storage.buckets set public = false where id in ('GSO','TASTE BUDZ','MAFIA terpz','premade-designs');
-- A public bucket may also have permissive object policies. Restrictive policies
-- prevent those granting direct API access to the gated collections.
create policy restricted_gallery_objects on storage.objects as restrictive for all to anon, authenticated
 using (bucket_id not in ('GSO','TASTE BUDZ','MAFIA terpz','premade-designs','restricted-galleries','processing','processing-inputs'))
 with check (bucket_id not in ('GSO','TASTE BUDZ','MAFIA terpz','premade-designs','restricted-galleries','processing','processing-inputs'));

create table public.processing_jobs (
 id uuid primary key, token_hash text not null, kind text not null,
 manifest jsonb not null, state text not null default 'uploading'
 check (state in ('uploading','queued','processing','complete','failed')),
 attempts integer not null default 0, error text, output_type text,
 created_at timestamptz not null default now(), started_at timestamptz,
 expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.processing_jobs enable row level security;
revoke all on public.processing_jobs from public, anon, authenticated;
grant all on public.processing_jobs to service_role;
create index processing_jobs_queue on public.processing_jobs(state, created_at);
create function public.claim_processing_job() returns setof public.processing_jobs
language plpgsql security definer set search_path = '' as $$
begin
 -- Serialize claims across replicas; global maximum two jobs.
 perform pg_advisory_xact_lock(773821);
 update public.processing_jobs set state = case when attempts < 2 then 'queued' else 'failed' end,
 error = 'Worker interrupted; retry limit reached.'
 where state = 'processing' and started_at < now() - interval '5 minutes';
 if (select count(*) from public.processing_jobs where state = 'processing') >= 2 then return; end if;
 return query update public.processing_jobs set state = 'processing', started_at = now(), attempts = attempts + 1
 where id = (select id from public.processing_jobs where state = 'queued' and expires_at > now()
 order by created_at for update skip locked limit 1) returning *;
end;
$$;
revoke all on function public.claim_processing_job() from public, anon, authenticated;
grant execute on function public.claim_processing_job() to service_role;

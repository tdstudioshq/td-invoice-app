-- Premade Designs: content-addressed, database-backed catalog manifest
--
-- Production already has a service-managed premade_designs table that was
-- created outside the checked-in migration history. This migration captures
-- that table shape for fresh environments, then adds normalized collections,
-- content/path invariants, and a service-role-only batch sync RPC.
--
-- The migration is additive. It does not delete, rename, move, or deactivate
-- any existing design or Storage object. Legacy object paths remain valid.

create table if not exists public.premade_designs (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  family         text not null,
  storage_bucket text not null default 'premade-designs',
  storage_path   text not null unique,
  filename       text not null,
  mime_type      text not null,
  width          integer,
  height         integer,
  size_bytes     bigint not null,
  sha256         character(64) not null unique,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.premade_designs enable row level security;

-- Existing production rows already satisfy these checks. NOT VALID keeps the
-- lock short while installing each constraint; VALIDATE verifies every row
-- without rewriting the table.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.premade_designs'::regclass
      and conname = 'premade_designs_sha256_format'
  ) then
    alter table public.premade_designs
      add constraint premade_designs_sha256_format
      check (rtrim(sha256) ~ '^[0-9a-f]{64}$') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.premade_designs'::regclass
      and conname = 'premade_designs_file_metadata_check'
  ) then
    alter table public.premade_designs
      add constraint premade_designs_file_metadata_check
      check (
        storage_bucket = 'premade-designs'
        and size_bytes > 0
        and mime_type in ('image/jpeg', 'image/png', 'image/webp')
        and (width is null or width > 0)
        and (height is null or height > 0)
      ) not valid;
  end if;
end;
$$;

alter table public.premade_designs
  validate constraint premade_designs_sha256_format;
alter table public.premade_designs
  validate constraint premade_designs_file_metadata_check;

-- storage.objects is case-sensitive, but the catalog intentionally is not.
-- This closes the case-only path race that an ordinary UNIQUE(storage_path)
-- constraint does not catch.
create unique index if not exists premade_designs_storage_path_lower_key
  on public.premade_designs (lower(storage_path));

create index if not exists premade_designs_family_idx
  on public.premade_designs (family);
create index if not exists premade_designs_sort_idx
  on public.premade_designs (family, sort_order);
create index if not exists premade_designs_active_idx
  on public.premade_designs (active) where active;

create or replace function public.premade_designs_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists premade_designs_touch_updated_at
  on public.premade_designs;
create trigger premade_designs_touch_updated_at
  before update on public.premade_designs
  for each row execute function public.premade_designs_touch_updated_at();

-- A design is one unique byte sequence. Collections are independent metadata,
-- so one stored object can appear in every local category that contains the
-- same artwork without creating another design row or Storage object.
create table if not exists public.premade_collections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint premade_collections_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$'
  ),
  constraint premade_collections_name_length check (
    length(name) between 1 and 500
  )
);

create table if not exists public.premade_design_collections (
  design_id                uuid not null
    references public.premade_designs (id) on delete cascade,
  collection_id            uuid not null
    references public.premade_collections (id) on delete cascade,
  source_relative_path     text not null,
  normalized_relative_path text not null,
  original_filename        text not null,
  normalized_filename      text not null,
  sort_order               integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (design_id, collection_id),
  constraint premade_design_collections_normalized_path_key
    unique (normalized_relative_path),
  constraint premade_design_collections_source_path_length check (
    length(source_relative_path) between 1 and 1000
    and length(normalized_relative_path) between 1 and 1000
  ),
  constraint premade_design_collections_filename_length check (
    length(original_filename) between 1 and 500
    and length(normalized_filename) between 1 and 500
  )
);

create index if not exists premade_design_collections_collection_sort_idx
  on public.premade_design_collections (collection_id, sort_order, design_id);

create or replace function public.premade_catalog_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists premade_collections_touch_updated_at
  on public.premade_collections;
create trigger premade_collections_touch_updated_at
  before update on public.premade_collections
  for each row execute function public.premade_catalog_touch_updated_at();

drop trigger if exists premade_design_collections_touch_updated_at
  on public.premade_design_collections;
create trigger premade_design_collections_touch_updated_at
  before update on public.premade_design_collections
  for each row execute function public.premade_catalog_touch_updated_at();

alter table public.premade_collections enable row level security;
alter table public.premade_design_collections enable row level security;

-- The keypad-gated page reads through a server-only service-role RPC. No
-- catalog table is a browser API, even though public is an exposed schema.
revoke all on table public.premade_designs from anon, authenticated;
revoke all on table public.premade_collections from anon, authenticated;
revoke all on table public.premade_design_collections from anon, authenticated;
grant select, insert, update, delete on table public.premade_designs to service_role;
grant select, insert, update, delete on table public.premade_collections to service_role;
grant select, insert, update, delete on table public.premade_design_collections to service_role;

-- Atomic batch upsert used by scripts/sync-premade-designs.ts. Storage uploads
-- happen before this call and use deterministic hash paths with upsert=false;
-- the database side then converges inside one transaction. Unique constraints
-- on sha256, storage_path, case-folded storage_path, and normalized source path
-- make concurrent or repeated syncs safe.
create or replace function public.sync_premade_catalog(
  p_designs jsonb,
  p_memberships jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  design_count integer := 0;
  membership_count integer := 0;
begin
  if jsonb_typeof(p_designs) <> 'array'
     or jsonb_typeof(p_memberships) <> 'array' then
    raise exception 'Catalog sync payloads must be JSON arrays.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_designs) as incoming(
      sha256 text, storage_path text, size_bytes bigint, mime_type text
    )
    join public.premade_designs existing
      on existing.sha256 = incoming.sha256::character(64)
    where existing.size_bytes <> incoming.size_bytes
       or existing.mime_type <> incoming.mime_type
  ) then
    raise exception 'A content hash conflicts with existing file metadata.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_designs) as incoming(
      sha256 text, storage_path text
    )
    join public.premade_designs existing
      on lower(existing.storage_path) = lower(incoming.storage_path)
    where existing.sha256 <> incoming.sha256::character(64)
  ) then
    raise exception 'A storage path is already assigned to different content.'
      using errcode = '23505';
  end if;

  insert into public.premade_designs (
    name,
    slug,
    family,
    storage_bucket,
    storage_path,
    filename,
    mime_type,
    width,
    height,
    size_bytes,
    sha256,
    active,
    sort_order
  )
  select
    incoming.name,
    incoming.slug,
    incoming.family,
    'premade-designs',
    incoming.storage_path,
    incoming.filename,
    incoming.mime_type,
    incoming.width,
    incoming.height,
    incoming.size_bytes,
    incoming.sha256::character(64),
    true,
    incoming.sort_order
  from jsonb_to_recordset(p_designs) as incoming(
    sha256 text,
    name text,
    slug text,
    family text,
    storage_path text,
    filename text,
    mime_type text,
    width integer,
    height integer,
    size_bytes bigint,
    sort_order integer
  )
  on conflict (sha256) do update
  set width = coalesce(public.premade_designs.width, excluded.width),
      height = coalesce(public.premade_designs.height, excluded.height),
      updated_at = now();

  get diagnostics design_count = row_count;

  insert into public.premade_collections (slug, name)
  select distinct on (incoming.collection_slug)
    incoming.collection_slug,
    incoming.collection_name
  from jsonb_to_recordset(p_memberships) as incoming(
    collection_slug text,
    collection_name text
  )
  order by incoming.collection_slug, incoming.collection_name
  on conflict (slug) do update
  set name = excluded.name,
      updated_at = now();

  if exists (
    select 1
    from jsonb_to_recordset(p_memberships) as incoming(
      sha256 text, normalized_relative_path text
    )
    join public.premade_design_collections membership
      on membership.normalized_relative_path = incoming.normalized_relative_path
    join public.premade_designs existing
      on existing.id = membership.design_id
    where existing.sha256 <> incoming.sha256::character(64)
  ) then
    raise exception 'A normalized source path is assigned to different content.'
      using errcode = '23505';
  end if;

  insert into public.premade_design_collections (
    design_id,
    collection_id,
    source_relative_path,
    normalized_relative_path,
    original_filename,
    normalized_filename,
    sort_order
  )
  select
    design.id,
    collection.id,
    incoming.source_relative_path,
    incoming.normalized_relative_path,
    incoming.original_filename,
    incoming.normalized_filename,
    incoming.sort_order
  from jsonb_to_recordset(p_memberships) as incoming(
    sha256 text,
    collection_slug text,
    source_relative_path text,
    normalized_relative_path text,
    original_filename text,
    normalized_filename text,
    sort_order integer
  )
  join public.premade_designs design
    on design.sha256 = incoming.sha256::character(64)
  join public.premade_collections collection
    on collection.slug = incoming.collection_slug
  on conflict (design_id, collection_id) do update
  set source_relative_path = excluded.source_relative_path,
      normalized_relative_path = excluded.normalized_relative_path,
      original_filename = excluded.original_filename,
      normalized_filename = excluded.normalized_filename,
      sort_order = excluded.sort_order,
      updated_at = now();

  get diagnostics membership_count = row_count;

  return jsonb_build_object(
    'designs_applied', design_count,
    'memberships_applied', membership_count
  );
end;
$function$;

revoke all on function public.sync_premade_catalog(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_premade_catalog(jsonb, jsonb)
  to service_role;

-- The new manifest is database-backed and emits collection relationships.
-- The storage.objects EXISTS probe is an indexed integrity guard; it prevents
-- an orphaned row from producing a broken card without listing the bucket.
create or replace function public.list_premade_design_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with linked as (
    select
      design.id,
      design.name,
      design.filename,
      design.storage_path,
      rtrim(design.sha256) as content_hash,
      collection.slug as collection,
      collection.name as collection_name,
      membership.sort_order
    from public.premade_designs design
    join public.premade_design_collections membership
      on membership.design_id = design.id
    join public.premade_collections collection
      on collection.id = membership.collection_id
    where design.active
      and exists (
        select 1
        from storage.objects object
        where object.bucket_id = design.storage_bucket
          and object.name = design.storage_path
      )
  ),
  fallback as (
    select
      design.id,
      design.name,
      design.filename,
      design.storage_path,
      rtrim(design.sha256) as content_hash,
      design.family as collection,
      initcap(replace(replace(design.family, '-', ' '), '_', ' ')) as collection_name,
      design.sort_order
    from public.premade_designs design
    where design.active
      and not exists (
        select 1 from public.premade_design_collections membership
        where membership.design_id = design.id
      )
      and exists (
        select 1
        from storage.objects object
        where object.bucket_id = design.storage_bucket
          and object.name = design.storage_path
      )
  ),
  manifest as (
    select * from linked
    union all
    select * from fallback
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', manifest.id,
        'name', manifest.name,
        'filename', manifest.filename,
        'path', manifest.storage_path,
        'content_hash', manifest.content_hash,
        'collection', manifest.collection,
        'collection_name', manifest.collection_name
      )
      order by manifest.collection, manifest.sort_order, manifest.name, manifest.id
    ),
    '[]'::jsonb
  )
  from manifest;
$function$;

revoke all on function public.list_premade_design_catalog()
  from public, anon, authenticated;
grant execute on function public.list_premade_design_catalog()
  to service_role;

-- Preserve compatibility with an older deployed app during rollout, while
-- changing its source from a raw bucket listing to the deduplicated DB table.
create or replace function public.list_premade_design_paths()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(design.storage_path order by design.storage_path), '[]'::jsonb)
  from public.premade_designs design
  where design.active
    and exists (
      select 1
      from storage.objects object
      where object.bucket_id = design.storage_bucket
        and object.name = design.storage_path
    );
$function$;

revoke all on function public.list_premade_design_paths()
  from public, anon, authenticated;
grant execute on function public.list_premade_design_paths()
  to service_role;

-- Rollback (manual, only after deploying an app version that no longer calls
-- the new RPC): drop list_premade_design_catalog/sync_premade_catalog, then the
-- two relationship tables. The legacy premade_designs rows and Storage objects
-- are deliberately independent and remain untouched.

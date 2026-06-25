-- TD Studios Platform — Social Hub (Phase 1: read-only Instagram)
--
-- Adds owner-scoped cached account metadata, posts, and sync logs. Instagram
-- access tokens are intentionally NOT stored in Postgres; the integration reads
-- the server-only INSTAGRAM_ACCESS_TOKEN environment variable.

create table if not exists public.social_accounts (
  id                            uuid primary key default gen_random_uuid(),
  owner_id                      uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  platform                      text not null default 'instagram'
    check (platform = 'instagram'),
  username                      text not null,
  instagram_business_account_id text not null,
  profile_picture_url           text,
  followers_count               bigint,
  follows_count                 bigint,
  media_count                   bigint,
  token_expires_at              timestamptz,
  last_synced_at                timestamptz,
  sync_status                   text not null default 'pending'
    check (sync_status in ('pending', 'syncing', 'connected', 'error')),
  sync_error                    text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (owner_id, platform),
  unique (id, owner_id)
);

create index if not exists social_accounts_owner_id_idx
  on public.social_accounts (owner_id);

create trigger social_accounts_set_updated_at
  before update on public.social_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.social_posts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  social_account_id  uuid not null,
  instagram_media_id text not null,
  caption            text,
  media_type         text not null,
  media_url          text,
  thumbnail_url      text,
  permalink          text not null,
  published_at       timestamptz not null,
  username           text not null,
  like_count         bigint,
  comments_count     bigint,
  raw_payload        jsonb not null default '{}'::jsonb,
  synced_at          timestamptz not null default now(),
  constraint social_posts_account_owner_fkey
    foreign key (social_account_id, owner_id)
    references public.social_accounts (id, owner_id) on delete cascade,
  unique (social_account_id, instagram_media_id)
);

create index if not exists social_posts_owner_published_idx
  on public.social_posts (owner_id, published_at desc);

create index if not exists social_posts_account_published_idx
  on public.social_posts (social_account_id, published_at desc);

create table if not exists public.social_sync_logs (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null
    references auth.users (id) on delete cascade default auth.uid(),
  social_account_id uuid not null,
  status            text not null
    check (status in ('running', 'completed', 'error')),
  posts_fetched     integer not null default 0,
  posts_upserted    integer not null default 0,
  error_message     text,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  constraint social_sync_logs_account_owner_fkey
    foreign key (social_account_id, owner_id)
    references public.social_accounts (id, owner_id) on delete cascade
);

create index if not exists social_sync_logs_account_started_idx
  on public.social_sync_logs (social_account_id, started_at desc);

alter table public.social_accounts enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_sync_logs enable row level security;

create policy social_accounts_admin_all on public.social_accounts
  for all to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy social_posts_admin_all on public.social_posts
  for all to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

create policy social_sync_logs_admin_all on public.social_sync_logs
  for all to authenticated
  using (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  )
  with check (
    owner_id = (select auth.uid())
    and not public.is_portal_user()
  );

-- Durable intake for the public /custom-design-request form.
-- Anonymous visitors never access these tables directly: the validated server
-- action writes with the service role, and admin pages read the same way.

create table public.custom_design_requests (
  id                 uuid primary key default gen_random_uuid(),
  reference_number   text not null unique
    check (reference_number ~ '^DES-[0-9A-Z]{6}$'),
  customer_name      text not null
    check (length(btrim(customer_name)) between 1 and 120),
  customer_email     text not null
    check (customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  customer_phone     text not null
    check (length(btrim(customer_phone)) between 1 and 40),
  instagram_username text not null
    check (length(btrim(instagram_username)) between 1 and 100),
  design_type        text not null
    check (design_type in ('Bag design', 'Jar design', 'Other')),
  notes              text not null
    check (length(btrim(notes)) between 1 and 4000),
  status             text not null default 'new'
    check (status in ('new', 'reviewing', 'quoted', 'in_progress', 'completed', 'cancelled')),
  submitter_hash     text check (submitter_hash is null or length(submitter_hash) <= 64),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.custom_design_request_files (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.custom_design_requests (id) on delete cascade,
  storage_path  text not null unique,
  file_name     text not null check (length(file_name) between 1 and 300),
  file_size     bigint not null check (file_size > 0 and file_size <= 25 * 1024 * 1024),
  mime_type     text not null check (length(mime_type) between 1 and 200),
  created_at    timestamptz not null default now()
);

create index custom_design_requests_created_at_idx
  on public.custom_design_requests (created_at desc);
create index custom_design_requests_status_idx
  on public.custom_design_requests (status, created_at desc);
create index custom_design_requests_submitter_idx
  on public.custom_design_requests (submitter_hash, created_at desc);
create index custom_design_request_files_request_idx
  on public.custom_design_request_files (request_id);

create trigger custom_design_requests_set_updated_at
  before update on public.custom_design_requests
  for each row execute function public.set_updated_at();

alter table public.custom_design_requests enable row level security;
alter table public.custom_design_request_files enable row level security;

-- Defense in depth for projects whose public schema is exposed through the
-- Data API. The service role still reaches both tables; browser roles do not.
revoke all on table public.custom_design_requests from anon, authenticated;
revoke all on table public.custom_design_request_files from anon, authenticated;

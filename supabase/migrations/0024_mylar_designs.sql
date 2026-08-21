-- TD Studios Invoice App — Custom Mylar Printing: multi-design orders
--
-- WHY
-- Migration 0023 stored artwork directly on the inquiry as eight columns
-- (front_artwork_* / back_artwork_*), which can represent exactly one design.
-- Real orders are not shaped that way: a customer ordering 1,000 bags may be
-- splitting them across three designs at 400 / 350 / 250, each with its own
-- front and back artwork. There is nowhere on a flat row to put the second
-- design, and no way to record how the quantity is allocated between them.
--
-- SHAPE
--   mylar_printing_inquiries
--     └── mylar_designs          (one row per design, carries its allocation)
--           └── mylar_artwork_files  (one row per uploaded file)
--
-- The artwork table is deliberately a child of the DESIGN rather than more
-- columns on the design, so adding a third artwork slot later (a gusset, a
-- sticker, a die line) is an INSERT with a new `side` value plus a widened
-- check constraint — not another schema migration of this size.
--
-- RLS follows the 0023 model exactly: enabled with NO policies on both new
-- tables. Inquiries are filed anonymously and have no owner_id to scope to, so
-- the only paths in are the validated public server action and the
-- requireAdmin()-guarded dashboard, both through the service-role client.
-- Leaving RLS off, or adding an anon policy, would expose customer artwork
-- keys and let anybody attach rows to somebody else's inquiry.
--
-- NON-DESTRUCTIVE. The legacy front_artwork_* / back_artwork_* columns are
-- backfilled into this structure and then LEFT IN PLACE. At the time of writing
-- production holds 3 inquiries, all three with both artwork files, so this is
-- not a "no data yet" migration and the columns are not safe to drop in the
-- same step that starts writing elsewhere. Drop them in a later migration once
-- the new tables have been serving reads for a while — see the note at the
-- bottom for the exact statement and the check to run first.

-- ---------------------------------------------------------------------------
-- Designs
-- ---------------------------------------------------------------------------
create table if not exists public.mylar_designs (
  id             uuid primary key default gen_random_uuid(),

  inquiry_id     uuid not null
    references public.mylar_printing_inquiries (id) on delete cascade,

  -- 1-based position as shown in the wizard ("DESIGN 1", "DESIGN 2"). Stored
  -- rather than derived from created_at so the admin view and the customer's
  -- confirmation always number the designs the same way.
  design_number  integer not null check (design_number between 1 and 500),

  -- Bags allocated to this design. The application enforces that the
  -- allocations sum to the inquiry's quantity (client for UX, server
  -- authoritatively); a cross-row sum cannot be expressed as a column check
  -- without a trigger, and a trigger here would fire mid-insert while the set
  -- is still incomplete.
  quantity       integer not null check (quantity between 1 and 1000000),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Two designs can never claim the same slot in one inquiry.
  constraint mylar_designs_number_unique unique (inquiry_id, design_number)
);

create index if not exists mylar_designs_inquiry_idx
  on public.mylar_designs (inquiry_id, design_number);

create trigger mylar_designs_set_updated_at
  before update on public.mylar_designs
  for each row execute function public.set_updated_at();

alter table public.mylar_designs enable row level security;

-- ---------------------------------------------------------------------------
-- Artwork files
-- ---------------------------------------------------------------------------
create table if not exists public.mylar_artwork_files (
  id            uuid primary key default gen_random_uuid(),

  design_id     uuid not null
    references public.mylar_designs (id) on delete cascade,

  -- Widen this check (not an enum) to add a slot later; `alter type ... add
  -- value` cannot run in a transaction and cannot remove a value, which is the
  -- same reasoning 0023 used for bag_type/status.
  side          text not null check (side in ('front', 'back')),

  -- Object key inside the private `mylar-artwork` bucket. Never a public URL —
  -- admins reach the bytes through /api/mylar-artwork/[inquiryId], which mints
  -- a 60-second signed URL. New keys are design-scoped:
  --   {inquiry_id}/{design_id}/{front|back}/{uuid}-{sanitized-name}
  -- Backfilled rows keep their original 0023 key,
  --   {inquiry_id}/{front|back}/{uuid}-{sanitized-name}
  -- which is why this column is not constrained to one shape.
  storage_path  text not null,

  file_name     text not null check (length(file_name) between 1 and 200),
  file_size     bigint not null check (file_size > 0),
  mime_type     text not null,

  created_at    timestamptz not null default now(),

  -- One file per side per design, matching the current UI. Relaxing this to
  -- allow several files per side later is a single DROP CONSTRAINT.
  constraint mylar_artwork_files_design_side_unique unique (design_id, side)
);

create index if not exists mylar_artwork_files_design_idx
  on public.mylar_artwork_files (design_id);

alter table public.mylar_artwork_files enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill
--
-- Every existing inquiry becomes exactly ONE design (number 1) holding the
-- inquiry's full quantity, with whatever artwork it already had attached.
--
-- One design, not design_count designs, even where design_count > 1. The old
-- schema recorded HOW MANY designs the customer said they had but never which
-- bags belonged to which — production currently has an inquiry with
-- design_count = 3 and a single artwork pair. Splitting 128 bags three ways
-- here would invent an allocation nobody agreed to and attach the only known
-- artwork to an arbitrary one of them. Collapsing to a single fully-allocated
-- design keeps the row internally consistent (sum(quantity) = inquiry
-- quantity) and leaves design_count as the customer's own stated figure, which
-- the admin view surfaces separately.
--
-- Idempotent: `where not exists` means re-running the migration is a no-op.
-- ---------------------------------------------------------------------------
insert into public.mylar_designs (inquiry_id, design_number, quantity, created_at, updated_at)
select i.id, 1, i.quantity, i.created_at, i.updated_at
from public.mylar_printing_inquiries i
where not exists (
  select 1 from public.mylar_designs d where d.inquiry_id = i.id
);

insert into public.mylar_artwork_files (design_id, side, storage_path, file_name, file_size, mime_type, created_at)
select d.id,
       'front',
       i.front_artwork_path,
       i.front_artwork_name,
       i.front_artwork_size,
       coalesce(i.front_artwork_mime_type, 'application/octet-stream'),
       i.created_at
from public.mylar_printing_inquiries i
join public.mylar_designs d
  on d.inquiry_id = i.id and d.design_number = 1
where i.front_artwork_path is not null
  and i.front_artwork_name is not null
  and i.front_artwork_size is not null
  and not exists (
    select 1 from public.mylar_artwork_files f
    where f.design_id = d.id and f.side = 'front'
  );

insert into public.mylar_artwork_files (design_id, side, storage_path, file_name, file_size, mime_type, created_at)
select d.id,
       'back',
       i.back_artwork_path,
       i.back_artwork_name,
       i.back_artwork_size,
       coalesce(i.back_artwork_mime_type, 'application/octet-stream'),
       i.created_at
from public.mylar_printing_inquiries i
join public.mylar_designs d
  on d.inquiry_id = i.id and d.design_number = 1
where i.back_artwork_path is not null
  and i.back_artwork_name is not null
  and i.back_artwork_size is not null
  and not exists (
    select 1 from public.mylar_artwork_files f
    where f.design_id = d.id and f.side = 'back'
  );

-- ---------------------------------------------------------------------------
-- Verify the backfill before trusting it.
--
--   -- every inquiry has at least one design, and allocations balance
--   select i.reference_number, i.quantity,
--          count(d.id) as designs, coalesce(sum(d.quantity), 0) as allocated
--   from public.mylar_printing_inquiries i
--   left join public.mylar_designs d on d.inquiry_id = i.id
--   group by i.id, i.reference_number, i.quantity
--   having count(d.id) = 0 or coalesce(sum(d.quantity), 0) <> i.quantity;
--   -- expected: zero rows
--
--   -- every legacy artwork column landed in a file row, with identical values
--   select i.reference_number, i.front_artwork_path, i.back_artwork_path
--   from public.mylar_printing_inquiries i
--   where (i.front_artwork_path is not null and not exists (
--            select 1 from public.mylar_artwork_files f
--            join public.mylar_designs d on d.id = f.design_id
--            where d.inquiry_id = i.id and f.side = 'front'
--              and f.storage_path = i.front_artwork_path
--              and f.file_name = i.front_artwork_name
--              and f.file_size = i.front_artwork_size))
--      or (i.back_artwork_path is not null and not exists (
--            select 1 from public.mylar_artwork_files f
--            join public.mylar_designs d on d.id = f.design_id
--            where d.inquiry_id = i.id and f.side = 'back'
--              and f.storage_path = i.back_artwork_path
--              and f.file_name = i.back_artwork_name
--              and f.file_size = i.back_artwork_size));
--   -- expected: zero rows
--
-- LATER MIGRATION ONLY — do not run this here. Once the new tables have been
-- serving reads in production for a while and both queries above still return
-- nothing, the legacy columns can go:
--
--   alter table public.mylar_printing_inquiries
--     drop column front_artwork_path,
--     drop column front_artwork_name,
--     drop column front_artwork_size,
--     drop column front_artwork_mime_type,
--     drop column back_artwork_path,
--     drop column back_artwork_name,
--     drop column back_artwork_size,
--     drop column back_artwork_mime_type;
-- ---------------------------------------------------------------------------

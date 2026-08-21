-- TD Studios Invoice App — Custom Mylar Printing inquiry intake
--
-- Backs the public, no-auth quote wizard at /mylar-printing. This is a QUOTE
-- REQUEST, not an order: no pricing, no payment, no line items. It is
-- deliberately one table plus private Storage objects.
--
-- OWNERSHIP / RLS — this table is the odd one out on purpose.
-- Every other business table here carries an `owner_id` scoped to auth.uid().
-- An inquiry is submitted by an anonymous visitor who has no account, so there
-- is no owner to scope to. Instead this follows the public.qr_generations
-- (migration 0010) pattern, which is the closest analog in this schema:
--   * RLS is ENABLED with NO policies, so the cookie-scoped anon/authenticated
--     client can neither read nor write a single row directly. A visitor cannot
--     enumerate inquiries, read someone else's contact details, or self-insert.
--   * Writes happen ONLY inside the server action
--     app/actions/mylar-printing.ts (zod-validated, rate limited, honeypot
--     checked) using the service-role client, which is not subject to RLS.
--   * Reads happen ONLY in the requireAdmin()-guarded /mylar-requests pages,
--     also via the service-role client.
-- Unlike qr_generations there is no SECURITY DEFINER insert helper: the write
-- is a validated server action rather than a fire-and-forget log, so granting
-- anon EXECUTE on anything would only widen the surface for no benefit.
--
-- bag_type / status are text + check rather than enums (matching
-- qr_generations.source/type rather than tasks.status). Both lists are expected
-- to grow — new bag sizes especially — and a check constraint can be replaced
-- in one statement, where `alter type ... add value` cannot run in a
-- transaction and cannot remove a value.

create table if not exists public.mylar_printing_inquiries (
  id                     uuid primary key default gen_random_uuid(),

  -- Public-facing handle shown to the customer and used in the notification
  -- email subject. Random (see generateReferenceNumber in
  -- app/actions/mylar-printing.ts), never derived from the id and never
  -- sequential, so it leaks no volume information.
  reference_number       text not null unique
    check (reference_number ~ '^MYL-[0-9A-Z]{6}$'),

  bag_type               text not null
    check (bag_type in ('3.5g-4x5', '3.5g-sideways-5x4', '2in1-8x5', 'pound-bag')),

  -- 128 pieces is the print minimum (1 lb portioned at 3.5 g). Upper bounds are
  -- sanity ceilings on a public endpoint, not business rules.
  quantity               integer not null check (quantity between 128 and 1000000),
  design_count           integer not null check (design_count between 1 and 500),

  artwork_coming_later   boolean not null default false,

  -- Object keys inside the private `mylar-artwork` bucket. Never public URLs —
  -- admins reach the bytes through /api/mylar-artwork/[inquiryId], which mints a
  -- short-lived signed URL.
  front_artwork_path     text,
  front_artwork_name     text,
  front_artwork_size     bigint check (front_artwork_size is null or front_artwork_size > 0),
  front_artwork_mime_type text,

  back_artwork_path      text,
  back_artwork_name      text,
  back_artwork_size      bigint check (back_artwork_size is null or back_artwork_size > 0),
  back_artwork_mime_type text,

  customer_name          text not null
    check (length(btrim(customer_name)) between 1 and 120),
  -- Deliberately loose: real-world addresses defeat clever regexes. The
  -- authoritative check is the zod schema in lib/mylar-printing/schema.ts; this
  -- only stops obvious garbage reaching the table.
  customer_email         text not null
    check (customer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  customer_phone         text check (customer_phone is null or length(customer_phone) <= 40),
  notes                  text check (notes is null or length(notes) <= 4000),

  status                 text not null default 'new'
    check (status in ('new', 'reviewing', 'quoted', 'approved', 'printing', 'completed', 'cancelled')),

  -- Salted, truncated SHA-256 of the submitter's IP — same privacy-preserving
  -- convention as qr_scans.ip_hash (app/q/[slug]/page.tsx). Never the raw
  -- address. Powers the durable per-IP submission rate limit.
  submitter_hash         text check (submitter_hash is null or length(submitter_hash) <= 64),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  -- An artwork slot is all-or-nothing: a stored path always has the metadata
  -- the admin UI needs to render and download it.
  constraint mylar_front_artwork_complete check (
    (front_artwork_path is null and front_artwork_name is null and front_artwork_size is null)
    or (front_artwork_path is not null and front_artwork_name is not null and front_artwork_size is not null)
  ),
  constraint mylar_back_artwork_complete check (
    (back_artwork_path is null and back_artwork_name is null and back_artwork_size is null)
    or (back_artwork_path is not null and back_artwork_name is not null and back_artwork_size is not null)
  )
);

-- Admin list view: newest first, optionally filtered by status.
create index if not exists mylar_printing_inquiries_created_at_idx
  on public.mylar_printing_inquiries (created_at desc);

create index if not exists mylar_printing_inquiries_status_idx
  on public.mylar_printing_inquiries (status, created_at desc);

-- Serves the rate-limit lookup ("how many submissions from this hash since T").
create index if not exists mylar_printing_inquiries_submitter_idx
  on public.mylar_printing_inquiries (submitter_hash, created_at desc);

create trigger mylar_printing_inquiries_set_updated_at
  before update on public.mylar_printing_inquiries
  for each row execute function public.set_updated_at();

-- RLS on, NO policies: nothing reaches this table except the service-role
-- client inside server-side code. See the header note.
alter table public.mylar_printing_inquiries enable row level security;


-- ---------------------------------------------------------------------------
-- Private Storage bucket for the uploaded print artwork.
--
-- Object key convention:  {inquiry_id}/{front|back}/{uuid}-{sanitized-name}
--   where inquiry_id is the server-minted uuid that later becomes the
--   inquiry row's primary key, so an object can only ever be claimed by the
--   submission it was uploaded for (app/actions/mylar-printing.ts re-checks the
--   full key against that prefix before persisting it).
--
-- Like `design-requests` (0021) this bucket has NO storage.objects policies:
-- every operation runs through the service-role client (mint signed upload URL
-- -> browser PUTs the bytes -> verify via storage.info() -> mint short-lived
-- signed download URL for admins only). The browser never holds anything but a
-- single-object signed URL, so the bucket is not enumerable and artwork is
-- never publicly readable.
--
-- file_size_limit is 50 MB rather than the 25 MB used by client-files and
-- design-requests: this bucket takes production print sources (layered PSD,
-- flattened TIFF, packaged AI), which routinely exceed 25 MB. Bytes go
-- browser -> Storage directly, so Next's ~4 MB Server Action body cap and
-- Vercel's request cap are not in the path. Keep this in sync with
-- MAX_ARTWORK_BYTES in lib/mylar-printing/artwork.ts.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('mylar-artwork', 'mylar-artwork', false, 50 * 1024 * 1024)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

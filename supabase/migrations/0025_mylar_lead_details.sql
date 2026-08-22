-- TD Studios Invoice App — Custom Mylar Printing: lead detail fields
--
-- WHY
-- The wizard captures what to PRINT but not enough to open the conversation.
-- Three fields close that gap, chosen because each one changes how the studio
-- makes first contact — not because they might theoretically be useful:
--
--   brand_name      the packaging job is usually known by the brand, not the
--                   person who filled the form in
--   contact_method  the home card's primary CTA is "Text Me", so a large share
--                   of this audience does not want an email; knowing which
--                   channel to open with is the difference between a reply and
--                   a dead lead
--   needed_by       a deadline reframes the whole conversation, and it is the
--                   one thing a customer will not think to mention unsolicited
--
-- ADDITIVE ONLY. This migration does NOT touch the legacy front_artwork_* /
-- back_artwork_* columns that 0024 backfilled and left in place — dropping
-- those is a separate change, made once the 0024 structure has been serving
-- reads for a while. See the note at the bottom of 0024_mylar_designs.sql.
--
-- ALL THREE ARE NULLABLE, and that is deliberate rather than lazy. The table
-- already holds inquiries filed before these questions existed; those customers
-- genuinely did not state a brand, a channel, or a deadline. A `not null
-- default 'email'` would invent an answer on their behalf and the admin view
-- would present the guess as fact. Null means "not stated", which is true, and
-- the admin screens render it as "—". The wizard requires contact_method going
-- forward — that rule lives in the submission schema, where it can say why.
--
-- RLS: unchanged and unchanged-able by this migration. The table has RLS
-- enabled with NO policies (0023), so it stays reachable only through the
-- service-role client — the validated public server action on the way in, the
-- requireAdmin()-guarded dashboard on the way out. Adding columns grants
-- nothing to anon or authenticated; there is no policy to widen.

-- `if not exists` on the column carries the whole definition with it, so a
-- re-run skips the constraint too and the migration stays idempotent.
alter table public.mylar_printing_inquiries
  -- Trading name / company. Free text: plenty of brands are stylised in ways a
  -- stricter rule would reject.
  add column if not exists brand_name text
    check (brand_name is null or length(brand_name) between 1 and 120),

  -- How the customer wants to be reached first. Text + check rather than a pg
  -- enum, matching bag_type and status in 0023: adding a channel later widens a
  -- constraint instead of running `alter type ... add value`, which cannot run
  -- in a transaction and cannot remove a value it added.
  --
  -- Informational only. Nothing in this app sends anything to the customer —
  -- this records a preference for a human to act on.
  add column if not exists contact_method text
    check (contact_method is null or contact_method in ('text', 'call', 'email')),

  -- Requested-by date, `date` not `timestamptz`: a deadline has no time of day
  -- and no timezone, and storing one would invite both. The floor is a typo
  -- guard, nothing more — no turnaround, scheduling, or capacity logic is
  -- derived from this column anywhere, and none should be.
  add column if not exists needed_by date
    check (needed_by is null or needed_by >= date '2020-01-01');

comment on column public.mylar_printing_inquiries.brand_name is
  'Customer brand / company. Null on inquiries filed before this field existed.';
comment on column public.mylar_printing_inquiries.contact_method is
  'Preferred first contact channel: text | call | email. Informational only — nothing is sent automatically. Null = not stated.';
comment on column public.mylar_printing_inquiries.needed_by is
  'Customer-requested completion date. No scheduling logic derives from this. Null = no deadline given.';

-- ---------------------------------------------------------------------------
-- Verify
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'mylar_printing_inquiries'
--     and column_name in ('brand_name', 'contact_method', 'needed_by');
--   -- expected: 3 rows, all is_nullable = YES
--
--   -- nothing was invented for existing rows
--   select count(*) as pre_existing_untouched
--   from public.mylar_printing_inquiries
--   where brand_name is null and contact_method is null and needed_by is null;
--   -- expected: every inquiry filed before this deploy
-- ---------------------------------------------------------------------------

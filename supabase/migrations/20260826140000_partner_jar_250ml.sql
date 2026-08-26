-- TD Studios — add the 250ml jar to the partner product line-up
--
-- The product list on design_job_items is a `check` constraint rather than a pg
-- enum precisely so it can be widened in one statement inside a transaction
-- (see the comment on lib/types/database.ts's PartnerProductType). This is that
-- statement, and it is the whole migration.
--
-- Purely additive: no existing row can violate the wider list, so the constraint
-- is re-added validated with no table rewrite beyond the scan. Nothing is
-- removed — 'jar_100ml' and 'jar_150ml' stay exactly as they were.
--
-- Widen these together or the UI offers a value the insert rejects:
--   lib/types/database.ts        PartnerProductType
--   lib/partner-jobs/types.ts    PARTNER_PRODUCT_TYPES + PARTNER_PRODUCT_TYPE_LABEL

alter table public.design_job_items
  drop constraint if exists design_job_items_product_type_check;

alter table public.design_job_items
  add constraint design_job_items_product_type_check
  check (product_type in (
    'eighth_bag', 'seven_gram_bag', 'two_in_one_bag', 'pound_bag',
    'jar_100ml', 'jar_150ml', 'jar_250ml'
  ));

-- Verify (expect the three jar values listed in the new constraint):
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'design_job_items_product_type_check';

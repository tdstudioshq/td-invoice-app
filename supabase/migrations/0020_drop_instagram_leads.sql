-- TD Studios Invoice App — remove the Instagram Leads CRM
--
-- The read-only /leads page was removed from the app entirely (the planned
-- follower-sync and lead-scoring features were never built). This drops the
-- 0005 table outright — same pattern as the Social Hub (0011) and Bio Pages
-- (0014) removals. 0005 is kept only as historical record.

drop table if exists public.leads;

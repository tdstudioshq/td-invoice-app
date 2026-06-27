-- TD Studios Platform — remove the Social Hub
--
-- The dormant read-only Instagram Social Hub (added in 0006) is being removed
-- entirely. These tables were never populated in production (Instagram was never
-- configured). Dropping them also drops their indexes, triggers, and RLS
-- policies. `cascade` clears the cross-table foreign keys between them.
--
-- Children first, then the parent, to keep the intent obvious.

drop table if exists public.social_sync_logs cascade;
drop table if exists public.social_posts cascade;
drop table if exists public.social_accounts cascade;

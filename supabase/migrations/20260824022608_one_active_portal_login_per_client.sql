-- TD Studios Invoice App — one active portal login per client
--
-- `client_users.user_id` has been UNIQUE since 0003, which guarantees one
-- portal mapping per PERSON. The opposite direction — one active mapping per
-- CLIENT — has always been an application assumption enforced by a read:
--
--     select ... from client_users where client_id = $1 and revoked_at is null
--
-- ...followed by an insert. That is a TOCTOU window. Two approvals racing for
-- the same client both see "no active login" and both insert, because their
-- rows differ in `user_id` and so never collide on the 0003 constraint. The
-- result is two people holding one client's portal — its files, its projects
-- and its invoices — which is exactly the outcome the read was meant to stop.
--
-- Both writers are affected and both are fixed by this one index:
--   * approvePortalAccessAction  (self-signup approval)
--   * createPortalUserAction     (admin portal invite)
--
-- A PARTIAL index is the right shape here: `revoked_at is null` scopes
-- uniqueness to *active* logins only, so a client may still accumulate any
-- number of historical revoked rows. (Revocation normally deletes the auth
-- user and cascades the row away; the revoked_at fallback in
-- revokePortalAccessAction is what leaves rows behind.) Nothing un-revokes a
-- row in place, so this index can never block a restore.
--
-- Verified read-only against production before writing this migration:
--     select client_id, count(*) from public.client_users
--      where revoked_at is null group by client_id having count(*) > 1;
--   -> 0 rows (1 active mapping total). The index will build without conflict.

create unique index if not exists client_users_one_active_per_client
  on public.client_users (client_id)
  where revoked_at is null;

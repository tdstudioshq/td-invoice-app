# Function permission inventory

Generated from the full repository migration replay in isolated PostgreSQL. This is **not** a live-project inventory. Run `docs/security-inventory.sql` after verifying project identity before rollout.

All listed functions are owned by `postgres` in the replay. New/reviewed functions use a fixed trusted search path (`public` plus `auth` only where Supabase auth helpers are referenced) and schema-qualified application objects. PUBLIC execution is revoked; the role matrix below includes inherited permissions.

| Exact signature | Security definer | anon | authenticated | service_role |
|---|---|---|---|---|
| assert_not_portal_user() | yes | no | no | no |
| assert_not_workspace_admin() | yes | no | no | no |
| assign_design_job_number() | yes | no | no | no |
| claim_processing_job() | yes | no | no | yes |
| clear_must_change_password() | yes | no | yes | yes |
| consume_security_quota(text,integer,integer,integer) | yes | no | no | yes |
| create_design_job(uuid,text,text,jsonb,jsonb) | no | no | yes | yes |
| current_owner_id() | yes | no | yes | yes |
| invoice_items_recalc() | no | no | no | no |
| invoices_recalc_on_rate_change() | no | no | no | no |
| is_partner_user() | yes | no | yes | yes |
| is_portal_user() | yes | no | yes | yes |
| is_workspace_admin() | yes | no | yes | yes |
| list_premade_design_paths() | yes | no | no | yes |
| log_partner_job_event(uuid,text,jsonb,text,text,text) | yes | no | yes | yes |
| log_qr_generation(text,text,text,jsonb) | yes | yes | yes | yes |
| log_qr_scan(uuid,text,text,text,text,text) | yes | yes | yes | yes |
| next_invoice_number() | yes | no | yes | yes |
| partner_company_id() | yes | no | yes | yes |
| portal_can_upload() | yes | no | yes | yes |
| portal_client_id() | yes | no | yes | yes |
| protect_design_job_columns() | no | no | no | no |
| recalc_invoice_totals(uuid) | no | no | yes | yes |
| record_deleted_partner_job() | yes | no | no | no |
| resolve_qr_target(text) | yes | yes | yes | yes |
| set_updated_at() | no | no | no | no |
| touch_design_job_from_file() | yes | no | no | no |
| update_design_job(uuid,text,text,jsonb) | no | no | yes | yes |

## Callers and dependencies

- `resolve_qr_target`, `log_qr_scan`: anonymous dynamic `/q/[slug]`; preserve anonymous execute.
- `log_qr_generation`: public and admin QR generation telemetry; preserve anonymous execute. QR record CRUD remains admin-only.
- `portal_client_id`, `is_portal_user`, `portal_can_upload`: portal table/storage policies and portal API operations. Authenticated execute required.
- `current_owner_id`: all canonical-owner RLS predicates, application writes, mobile admin writes; now returns NULL outside the allowlist. The helper reads policy-less ownership tables as definer, avoiding RLS recursion. Both USING and WITH CHECK predicates that call it narrow together; additive portal policies stay intact.
- `is_workspace_admin`: invoice sequence authorization; membership stored in server-managed tables, not user metadata.
- `next_invoice_number`: invoice INSERT default; authenticated execution necessary but function now validates admin membership. Raw sequence privileges revoked for API users.
- `recalc_invoice_totals`: called by invoker invoice triggers, so authenticated execute must remain; its reads/writes are RLS-scoped.
- `create_design_job`, `update_design_job`: partner actions, SECURITY INVOKER, company-scoped RLS. Existing status protections preserved.
- `log_partner_job_event`: partner actions via user client, studio actions via service client. Membership and job company checked, fixed event enums and typed/capped payload fields. `auth.uid() IS NULL` never grants privilege. Service authority comes from the trusted JWT role.
- `clear_must_change_password`: own portal password-reset flag only.
- `list_premade_design_paths`: service-only private manifest.
- Trigger-only functions: invoice recalculation hooks, timestamps, workspace/portal mutual exclusion, partner numbering, protected columns, file-activity timestamp and deletion capture. No direct API execute grants. PostgreSQL trigger invocation still works, tested during invoice and partner mutations.
- `consume_security_quota`, `claim_processing_job`: server/worker only; tables have RLS and no browser policies/grants.

The new migration revokes both PostgreSQL's global PUBLIC function default and Supabase's schema-specific API grants for the repository creator role, `postgres`. Additional live creator roles are an explicit rollout inventory requirement. Previously applied migration files were not changed.

Retired storage access: `cutline_files_owner_all` is dropped because no application, mobile or script references the `cutline-files` bucket. Objects/bucket remain untouched.

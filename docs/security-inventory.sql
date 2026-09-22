-- Read-only rollout preflight. Run ONLY after verifying the project identity.
select n.nspname, p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as creator,
 p.prosecdef as security_definer, p.proconfig as settings, p.proacl,
 has_function_privilege('anon',p.oid,'execute') as anon,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated,
 has_function_privilege('service_role',p.oid,'execute') as service_role
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' order by 2;
select pg_get_userbyid(defaclrole) as creator, defaclnamespace::regnamespace, defaclobjtype, defaclacl
from pg_default_acl;
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select tgrelid::regclass as relation, tgname, tgfoid::regprocedure as function
from pg_trigger where not tgisinternal order by 1,2;
select id,public,file_size_limit from storage.buckets order by id;
select owner_id from public.workspace_owner;
select user_id from public.workspace_admins;

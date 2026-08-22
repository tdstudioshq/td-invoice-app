-- One server-only manifest read replaces 95 Storage folder-list calls for the
-- private premade gallery. The function returns filenames only; image bytes
-- still require short-lived signed URLs after the keypad gate is validated.
create or replace function public.list_premade_design_paths()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(objects.name order by objects.name), '[]'::jsonb)
  from storage.objects as objects
  where objects.bucket_id = 'premade-designs'
    and lower(objects.name) ~ '\.(jpe?g|png|webp|gif|avif|svg)$';
$function$;

-- SECURITY DEFINER functions receive EXECUTE for PUBLIC by default. This RPC
-- is exclusively for the app's server-only service-role client.
revoke all on function public.list_premade_design_paths()
from public, anon, authenticated;

grant execute on function public.list_premade_design_paths() to service_role;

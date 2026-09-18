import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
await db.exec(await readFile('tests/database/bootstrap.sql','utf8'));
for (const name of (await readdir('supabase/migrations')).filter(n => n.endsWith('.sql')).sort()) {
 const sql = (await readFile(`supabase/migrations/${name}`,'utf8')).replace('create extension if not exists "pgcrypto";', '');
 try { await db.exec(sql); } catch (error) { console.error('Migration failed:', name); throw error; }
}
console.log('All migrations replayed in isolated PostgreSQL');
const functions = await db.query(`select p.oid::regprocedure::text as signature,
 pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
 has_function_privilege('anon',p.oid,'execute') as anon,
 has_function_privilege('authenticated',p.oid,'execute') as authenticated,
 has_function_privilege('service_role',p.oid,'execute') as service_role,
 p.proconfig as settings
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`);
if (process.argv.includes('--inventory')) console.log(JSON.stringify(functions.rows,null,2));
await db.exec(await readFile('tests/database/security.sql','utf8'));
console.log('Database security assertions passed');
await db.close();

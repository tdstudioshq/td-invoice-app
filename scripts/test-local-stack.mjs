// Only local Supabase; never accepts a database URL or production credentials.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
const status = spawnSync('supabase',['status','--output','json'],{encoding:'utf8'});
if(status.status !== 0) throw new Error('Start the isolated local Supabase stack first.');
const local = JSON.parse(status.stdout);
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(local.API_URL)) throw new Error('Refusing non-local Supabase target');
const env = {...process.env};
for(const file of readdirSync('.').filter(n=>/^\.env(?:\.|$)/.test(n))) for(const line of readFileSync(file,'utf8').split('\n')) {
 const m=line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);if(m) env[m[1]]='';
}
Object.assign(env,{
 SUPABASE_URL:local.API_URL, SUPABASE_SECRET_KEY:local.SERVICE_ROLE_KEY,
 NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,
 NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3101',DISABLE_EXTERNAL_EFFECTS:'true',RESEND_API_KEY:'',
 GALLERY_SESSION_SECRET:'synthetic-local-test-secret-never-use-in-production', GALLERY_CODE_DESIGNS:'9876',
 ADMIN_EMAILS:'admin@integration.test',PROCESSING_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1',
});
const result=spawnSync('npx',['playwright','test','--config','playwright.integration.config.ts'],{env,stdio:'inherit'});
process.exit(result.status ?? 1);

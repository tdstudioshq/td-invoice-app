// Prevent Next's automatic .env.local loading from reaching production in checks.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const env = { ...process.env };
for (const file of readdirSync('.').filter(n => /^\.env(?:\.|$)/.test(n))) {
 for (const line of readFileSync(file, 'utf8').split('\n')) { const match = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/); if (match) env[match[1]] = ''; }
}
for (const key of Object.keys(env)) if (/SUPABASE|RESEND|FORMPSREE|FORMSPREE|GALLERY_|PROCESSING_ENABLED/.test(key)) env[key] = '';
env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3100';
env.DISABLE_EXTERNAL_EFFECTS = 'true';
env.NEXT_TELEMETRY_DISABLED = '1';
const [command, ...args] = process.argv.slice(2);
const result = spawnSync(command, args, { env, stdio: 'inherit' });
process.exit(result.status ?? 1);

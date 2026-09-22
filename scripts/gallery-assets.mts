/** Plan is offline. Upload and verify require an explicitly checked project ref.
 * Never deletes source files, storage objects, or rewrites Git history. */
import { createClient } from '@supabase/supabase-js';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const manifestPath = 'docs/gallery-assets-manifest.json';
const mode = process.argv[2] ?? 'plan';
if (mode === 'plan') {
 const sources = (await readdir('assets/newpremades')).filter(n => n.endsWith('.webp')).sort().map(n => ({ source: `assets/newpremades/${n}`, path: `newpremades/${n}` }));
 sources.push({ source: 'app/martyig/leads.json', path: 'martyig/leads.json' });
 const rows = [];
 for (const item of sources) { const bytes = await readFile(item.source); rows.push({ ...item, bytes: bytes.length, sha256: hash(bytes) }); }
 await writeFile(manifestPath, JSON.stringify({ bucket: 'restricted-galleries', assets: rows }, null, 2) + '\n');
 console.log(`Manifest: ${rows.length} assets. No transfers performed.`);
} else {
 if (!['upload', 'verify'].includes(mode)) throw new Error('Use plan, upload, or verify');
 const url = process.env.SUPABASE_URL ?? '';
 const expected = process.env.ASSET_TARGET_PROJECT_REF;
 if (!expected || new URL(url).hostname !== `${expected}.supabase.co`) throw new Error('Explicit target project identity must match SUPABASE_URL');
 if (expected === 'tbgyyyffbxveukbihnhp' && process.env.ALLOW_PRODUCTION_ASSET_COPY !== 'true') throw new Error('Production copy requires separately reviewed ALLOW_PRODUCTION_ASSET_COPY=true');
 const key = process.env.SUPABASE_SECRET_KEY; if (!key) throw new Error('Missing server credential');
 const db = createClient(url, key);
 const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { bucket: string; assets: {source: string; path: string; bytes: number; sha256: string}[] };
 const bucket = await db.storage.getBucket(manifest.bucket);
 if (bucket.error || bucket.data.public) throw new Error('Target bucket must exist and be private');
 for (const asset of manifest.assets) {
   const remote = await db.storage.from(manifest.bucket).download(asset.path);
   if (remote.data && hash(new Uint8Array(await remote.data.arrayBuffer())) === asset.sha256) continue;
   if (remote.data) throw new Error(`Remote content differs: ${asset.path}; refusing overwrite`);
   if (mode === 'verify') throw new Error(`Missing remote asset: ${asset.path}`);
   const bytes = await readFile(asset.source);
   if (hash(bytes) !== asset.sha256) throw new Error(`Source changed: ${asset.source}; regenerate manifest`);
   const uploaded = await db.storage.from(manifest.bucket).upload(asset.path, bytes, { upsert: false, contentType: asset.path.endsWith('.json') ? 'application/json' : 'image/webp', cacheControl: '0' });
   if (uploaded.error) throw new Error(`Upload failed: ${asset.path}`);
   const checked = await db.storage.from(manifest.bucket).download(asset.path);
   if (!checked.data || hash(new Uint8Array(await checked.data.arrayBuffer())) !== asset.sha256) throw new Error(`Verification failed: ${asset.path}`);
 }
 console.log('All manifest objects verified. Source assets retained; application smoke checks required before removal.');
}

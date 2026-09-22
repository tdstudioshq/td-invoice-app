import { createClient } from "@supabase/supabase-js";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { manifestSchema } from "../lib/processing/schema";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Worker Supabase configuration missing");
const db = createClient(url, key, {
 auth: { persistSession: false, autoRefreshToken: false },
 global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
});
async function cleanup() {
 const { data, error } = await db.from("processing_jobs").select("id, manifest").lt("expires_at", new Date().toISOString()).limit(50);
 if (error) throw error;
 for (const row of data ?? []) {
   const paths = manifestSchema.parse(row.manifest).files.map((_, i) => `${row.id}/input-${i}`);
   const removed = await db.storage.from("processing-inputs").remove(paths);
   const output = await db.storage.from("processing").remove([`${row.id}/output`]);
   if (!removed.error && !output.error) await db.from("processing_jobs").delete().eq("id", row.id);
 }
 await db.from("security_quotas").delete().lt("resets_at", new Date(Date.now() - 86400000).toISOString());
}
async function once() {
 await cleanup();
 const { data, error } = await db.rpc("claim_processing_job");
 if (error) throw error;
 const job = data?.[0]; if (!job) return;
 const directory = await mkdtemp(`${tmpdir()}/td-render-`);
 try {
   const manifest = manifestSchema.parse(job.manifest);
   await writeFile(`${directory}/manifest.json`, JSON.stringify(manifest));
   const transferDeadline = AbortSignal.timeout(60000);
   for (const [i, file] of manifest.files.entries()) {
     // No caller-provided URL or bucket: only immutable server-issued object paths.
     const signed = await db.storage.from("processing-inputs").createSignedUrl(`${job.id}/input-${i}`, 60);
     if (!signed.data || signed.error) throw new Error("Missing upload");
     const res = await fetch(signed.data.signedUrl, { signal: transferDeadline, redirect: "error" });
     if (!res.ok || !res.body) throw new Error("Upload unavailable");
     const chunks: Uint8Array[] = []; let size = 0;
     for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
       size += chunk.length; if (size > file.size) throw new Error("Oversized upload"); chunks.push(chunk);
     }
     if (size !== file.size) throw new Error("Incomplete upload");
     await writeFile(`${directory}/input-${i}`, Buffer.concat(chunks));
   }
   await new Promise<void>((resolve, reject) => {
     const child = spawn(process.execPath, ["--max-old-space-size=768", "--conditions=react-server", "--import=tsx", "worker/process.mts", directory], {
       // Deliberately do not pass service credentials to the native decoder.
       env: { PATH: process.env.PATH, NODE_ENV: "production" }, stdio: "ignore",
     });
     const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
     child.on("error", reject); child.on("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error("Render failed or exceeded two minute limit")); });
   });
   const bytes = await readFile(`${directory}/output`), type = await readFile(`${directory}/type`, "utf8");
   const upload = await db.storage.from("processing").upload(`${job.id}/output`, bytes, { contentType: type, upsert: true, cacheControl: "0" });
   if (upload.error) throw upload.error;
   const saved = await db.from("processing_jobs").update({ state: "complete", output_type: type, error: null }).eq("id", job.id).eq("attempts", job.attempts);
   if (saved.error) throw saved.error;
 } catch {
   await db.from("processing_jobs").update({ state: job.attempts < 2 ? "queued" : "failed", error: "Processing failed. Check image format, 40 MP input limit, export dimensions, and retry." }).eq("id", job.id).eq("attempts", job.attempts);
 } finally { await rm(directory, { recursive: true, force: true }); }
}
while (true) { try { await once(); } catch { console.error("Worker backend unavailable; retrying."); } await new Promise(r => setTimeout(r, 3000)); }

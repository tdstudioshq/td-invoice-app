"use client";
/** Bytes go browser -> private Storage -> bounded worker -> signed download. */
export async function processImageJob(endpoint: string, form: FormData, progress?: (phase: "uploading" | "processing", percent: number) => void): Promise<Response> {
 const files: { field: string; file: File }[] = [];
 const fields: Record<string, string> = {};
 for (const [field, value] of form) { if (value instanceof File) files.push({ field, file: value }); else fields[field] = value; }
 const requestId = crypto.randomUUID();
 const capability = Array.from(crypto.getRandomValues(new Uint8Array(32)), n=>n.toString(16).padStart(2,"0")).join("");
 const manifest = JSON.stringify({requestId, capability, fields, files: files.map(({field,file})=>({field,name:file.name,size:file.size,type:file.type}))});
 let ticket: Response | null = null;
 for (let attempt = 0; attempt < 3; attempt++) {
   ticket = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:manifest,signal:AbortSignal.timeout(30000)}).catch(()=>null);
   if (ticket && ticket.status < 500) break;
 }
 if (!ticket) throw new Error("Could not start processing. Please retry.");
 const job = await ticket.json();
 if (!ticket.ok) throw new Error(job.error ?? "Could not start processing.");
 for (const [i, { file }] of files.entries()) {
   await new Promise<void>((resolve, reject) => {
     const xhr = new XMLHttpRequest(); xhr.open("PUT", job.uploads[i].url);
     xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
     xhr.timeout = 120000;
     xhr.upload.onprogress = event => progress?.("uploading", Math.round(100 * (i + (event.lengthComputable ? event.loaded / event.total : 0)) / files.length));
     xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed. Retry the export."));
     xhr.onerror = xhr.ontimeout = () => reject(new Error("Upload interrupted. Retry the export."));
     xhr.send(file);
   });
 }
 const url = `/api/processing/${job.id}`, headers = { Authorization: `Bearer ${job.token}` };
 progress?.("processing", 100);
 // Repeating commit/poll is safe; the same job is never queued twice.
 let committed = false;
 for (let i = 0; i < 3 && !committed; i++) {
   committed = await fetch(url, { method: "POST", headers }).then(r => r.ok).catch(() => false);
 }
 if (!committed) throw new Error("Could not queue export. Retry later.");
 const deadline = Date.now() + 10 * 60 * 1000;
 while (Date.now() < deadline) {
   await new Promise(r => setTimeout(r, 2000));
   const response = await fetch(url, { headers, cache: "no-store" }).catch(() => null);
   if (!response || response.status >= 500) continue;
   const state = await response.json();
   if (!response.ok || state.state === "failed") throw new Error(state.error ?? "Export failed. Retry the export.");
   if (state.state === "complete") {
     const download = await fetch(state.url, { cache: "no-store" });
     if (!download.ok) continue; // Poll again for a fresh URL, reusing the completed job.
     return download;
   }
 }
 throw new Error("Processing took too long. Retry later; temporary files expire automatically.");
}

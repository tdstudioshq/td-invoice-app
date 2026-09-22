import "server-only";
import { isDeepStrictEqual } from "node:util";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { securityService } from "@/lib/security/service";
import { allowAttempt } from "@/lib/security/throttle";
import { equalSecret } from "@/lib/security/tokens";
import { manifestSchema } from "./schema";
const headers = { "Cache-Control": "private, no-store" };
export const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function startJob(req: Request, kind?: string) {
 if (process.env.PROCESSING_ENABLED !== "true") return reply({ error: "Image processing is temporarily unavailable." }, 503);
 // Read with a hard cap even if Content-Length is missing or dishonest.
 let text = "", bytesRead = 0;
 const decoder = new TextDecoder();
 const reader = req.body?.getReader();
 if (!reader) return reply({ error: "Missing manifest" }, 400);
 while (true) { const { value, done } = await reader.read(); if (done) break;
   bytesRead += value.byteLength;
   text += decoder.decode(value, { stream: true }); if (bytesRead > 32_000) { await reader.cancel(); return reply({ error: "Manifest too large" }, 413); }
 }
 text += decoder.decode();
 let body; try { body = JSON.parse(text); } catch { return reply({ error: "Expected a JSON upload manifest." }, 400); }
 const parsed = manifestSchema.safeParse(kind ? { ...body, kind } : body);
 if (!parsed.success) return reply({ error: "Invalid upload manifest." }, 400);
 const db = securityService();
 const id = parsed.data.requestId ?? randomUUID();
 const token = parsed.data.capability ?? randomBytes(32).toString("base64url");
 const { data: existing, error: lookupError } = await db.from("processing_jobs").select("id,token_hash,manifest").eq("id",id).maybeSingle();
 if (lookupError) return reply({ error: "Processing backend unavailable." },503);
 const manifest = { kind: parsed.data.kind, fields: parsed.data.fields, files: parsed.data.files };
 // JSONB normalizes object key order; compare structure, not serialized bytes.
 if (existing && (!equalSecret(existing.token_hash, tokenHash(token)) || !isDeepStrictEqual(existing.manifest, manifest))) {
   return reply({ error: "Upload identity mismatch." },409);
 }
 if (!existing && !await allowAttempt("processing", 30, 3600)) return reply({ error: "Hourly processing quota reached or service unavailable. Try later." }, 429);
 // Global budget protects storage/queue even when clients distribute their IPs.
 const quota = existing ? { error: null, data: true } : await db.rpc("consume_security_quota", { p_key: "processing:global", p_limit: 10240, p_seconds: 86400, p_cost: parsed.data.files.length * 30 + 120 });
 if (quota.error || !quota.data) return reply({ error: "Processing capacity reached. Try later." }, 429);
 const { error } = existing ? { error: null } : await db.from("processing_jobs").insert({ id, token_hash: tokenHash(token), kind: manifest.kind, manifest });
 if (error) return reply({ error: "Could not create job." }, 503);
 const uploads = [];
 for (let i = 0; i < parsed.data.files.length; i++) {
   const signed = await db.storage.from("processing-inputs").createSignedUploadUrl(`${id}/input-${i}`, { upsert: false });
   if (signed.error || !signed.data) return reply({ error: "Could not authorize upload. Please retry." }, 503);
   uploads.push({ url: signed.data.signedUrl });
 }
 return reply({ id, token, uploads }, 201);
}
export async function authorizeJob(req: Request, id: string) {
 if (!/^[\da-f-]{36}$/.test(id)) return null;
 const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
 if (!/^(?:[\w-]{43}|[a-f0-9]{64})$/.test(token)) return null;
 const { data, error } = await securityService().from("processing_jobs").select("*").eq("id", id).maybeSingle();
 return !error && data && Date.parse(data.expires_at) > Date.now() && equalSecret(data.token_hash, tokenHash(token)) ? data : null;
}

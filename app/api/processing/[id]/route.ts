import { authorizeJob, reply } from "@/lib/processing/api";
import { securityService } from "@/lib/security/service";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
 const { id } = await ctx.params;
 const job = await authorizeJob(req, id);
 if (!job) return reply({ error: "Unauthorized" }, 401);
 // Commit is idempotent. The worker validates every object before decoding.
 if (job.state === "uploading") {
   const { error } = await securityService().from("processing_jobs").update({ state: "queued" }).eq("id", id).eq("state", "uploading");
   if (error) return reply({ error: "Queue unavailable. Retry this job." }, 503);
 }
 return reply({ ok: true });
}
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
 const { id } = await ctx.params;
 const job = await authorizeJob(req, id);
 if (!job) return reply({ error: "Unauthorized" }, 401);
 if (job.state !== "complete") return reply({ state: job.state, error: job.error });
 const { data, error } = await securityService().storage.from("processing").createSignedUrl(`${id}/output`, 60, { download: `td-${job.kind}.${job.output_type === "application/pdf" ? "pdf" : job.output_type === "image/png" ? "png" : "jpg"}` });
 if (error || !data) return reply({ error: "Download temporarily unavailable. Retry." }, 503);
 return reply({ state: "complete", url: data.signedUrl });
}

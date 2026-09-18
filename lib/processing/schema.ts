import { z } from "zod";
export const manifestSchema = z.object({
 requestId: z.string().uuid().optional(),
 capability: z.string().regex(/^[a-f0-9]{64}$/).optional(),
 kind: z.enum(["cutline", "mockup-sheet", "bag-mockup-grid"]),
 fields: z.record(z.string().max(100), z.string().max(12000)).refine(v => Object.keys(v).every(k => ["meta", "preset"].includes(k))),
 files: z.array(z.object({ field: z.string().regex(/^(file|file:[\w-]{1,80})$/), name: z.string().min(1).max(240), size: z.number().int().positive().max(30 * 1024 * 1024), type: z.string().max(100) })).min(1).max(40),
}).superRefine((v, ctx) => {
 const limit = v.kind === "cutline" ? 30 : 25;
 if (v.files.some(f => f.size > limit * 1024 * 1024) || v.files.reduce((s,f) => s + f.size, 0) > 80 * 1024 * 1024 ||
   new Set(v.files.map(f => f.field)).size !== v.files.length || (v.kind === "cutline" && (v.files.length !== 1 || v.files[0].field !== "file")))
 ctx.addIssue({ code: "custom", message: "Invalid upload size or file count." });
});
export type Manifest = z.infer<typeof manifestSchema>;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_OUTPUT_BYTES = 120 * 1024 * 1024;

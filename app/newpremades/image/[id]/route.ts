import { readFile } from "node:fs/promises";
import path from "node:path";
import { hasNewPremadesAccess } from "../../access";
import designs from "../../manifest.json";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!(await hasNewPremadesAccess())) return new Response("Unauthorized", { status: 401, headers });
  const { id } = await context.params;
  if (!designs.some((design) => design.id === id)) return new Response("Not found", { status: 404, headers });
  const variant = new URL(request.url).searchParams.get("size") === "preview" ? "preview" : "thumb";
  const data = await readFile(path.join(process.cwd(), "assets", "newpremades", `${id}-${variant}.webp`));
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": "image/webp" } });
}

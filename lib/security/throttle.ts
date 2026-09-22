import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { securityService } from "./service";
export async function allowAttempt(scope: string, limit: number, seconds: number) {
  const secret = process.env.GALLERY_SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  const h = await headers();
  // Vercel overwrites this header. Else use a single shared bucket, never a
  // caller-controlled X-Forwarded-For that could trivially bypass the quota.
  const ip = process.env.VERCEL ? h.get("x-vercel-forwarded-for") ?? "unknown" : "local";
  const key = createHmac("sha256", secret).update(`${scope}:${ip}`).digest("hex");
  try {
    const { data, error } = await securityService().rpc("consume_security_quota", { p_key: key, p_limit: limit, p_seconds: seconds });
    if (error || data !== true) return false;
    if (scope.startsWith("gallery:")) {
      const global = await securityService().rpc("consume_security_quota", { p_key: scope, p_limit: 100, p_seconds: seconds });
      if (global.error || global.data !== true) return false;
    }
    return true;
  } catch { return false; }
}

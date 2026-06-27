import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

// Public dynamic-QR redirect. Resolves an active slug to its code id +
// destination via the SECURITY DEFINER `resolve_qr_target` helper (no owner data
// exposed), records a best-effort scan, and 302s to the destination. Unknown,
// inactive, or non-URL slugs 404. No session required; allow-listed in proxy.ts.
export const dynamic = "force-dynamic";

// Coarse device class from the UA string — never the full fingerprint.
function classifyDevice(ua: string | null): string | null {
  if (!ua) return null;
  if (/\b(iPad|Tablet)\b/i.test(ua)) return "tablet";
  if (/\b(Mobi|iPhone|Android)\b/i.test(ua)) return "mobile";
  return "desktop";
}

// Salted, truncated SHA-256 of the IP — we never store the raw address.
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.QR_SCAN_SALT ?? "td-studios-qr";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export default async function QrRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_qr_target", {
    p_slug: slug,
  });
  const target = Array.isArray(data) ? data[0] : null;
  if (error || !target) notFound();

  // Best-effort scan logging — wrapped so a logging failure never blocks or
  // delays the redirect. A single guarded insert; fast enough to await.
  try {
    const headerList = await headers();
    const userAgent = headerList.get("user-agent");
    const forwardedFor = headerList.get("x-forwarded-for");
    const ip = forwardedFor
      ? forwardedFor.split(",")[0]?.trim()
      : headerList.get("x-real-ip");
    await supabase.rpc("log_qr_scan", {
      p_qr_code_id: target.qr_code_id,
      p_referrer: headerList.get("referer"),
      p_user_agent: userAgent,
      p_ip_hash: hashIp(ip ?? null),
      p_country: headerList.get("x-vercel-ip-country"),
      p_device: classifyDevice(userAgent),
    });
  } catch {
    /* logging is best-effort; continue to the redirect regardless */
  }

  redirect(target.destination_url);
}

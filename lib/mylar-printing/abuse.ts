import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

/**
 * Lightweight abuse controls for the PUBLIC mylar-printing endpoints. There was
 * no rate-limiting infrastructure in this repo before this feature and no
 * CAPTCHA provider, so this deliberately adds neither a dependency nor a
 * service — three cheap layers instead:
 *
 *   1. `submitterHash()` — a salted, truncated SHA-256 of the caller's IP, the
 *      same privacy-preserving convention qr_scans uses (app/q/[slug]/page.tsx).
 *      The raw address is never stored.
 *   2. `checkBurst()` — an in-process fixed-window counter. Fast and free, but
 *      per-instance: on Vercel a burst spread across cold starts can slip past
 *      it. It exists to blunt hammering within one warm instance, NOT as the
 *      durable limit.
 *   3. The durable limit, in the action itself: count rows in
 *      mylar_printing_inquiries with the same submitter_hash inside
 *      SUBMIT_WINDOW_MS. That one survives restarts and is shared across
 *      instances, because it's just the database.
 *
 * Plus a honeypot field and a minimum fill time, both checked in the action.
 */

/** Reuses QR_SCAN_SALT so there is one place to rotate the hashing salt. */
function salt(): string {
  return process.env.QR_SCAN_SALT ?? "td-studios-qr";
}

/** Salted, truncated SHA-256 of the caller's IP. Never the raw address. */
export async function submitterHash(): Promise<string | null> {
  try {
    const headerList = await headers();
    const forwardedFor = headerList.get("x-forwarded-for");
    const ip = forwardedFor
      ? forwardedFor.split(",")[0]?.trim()
      : headerList.get("x-real-ip");
    if (!ip) return null;
    return createHash("sha256")
      .update(`${salt()}:mylar:${ip}`)
      .digest("hex")
      .slice(0, 32);
  } catch {
    return null;
  }
}

/** How far back the durable per-submitter submission limit looks. */
export const SUBMIT_WINDOW_MS = 10 * 60 * 1000;

/** Submissions allowed per submitter inside SUBMIT_WINDOW_MS. */
export const SUBMIT_WINDOW_MAX = 3;

/**
 * A form filled faster than this was not filled by a person — the wizard has
 * five steps. Generous on purpose: a fast returning customer with autofill
 * still clears it comfortably.
 */
export const MIN_FILL_MS = 3_000;

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

/** Drop expired entries so an unbounded key space can't grow the map forever. */
function sweep(now: number) {
  if (windows.size < 500) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

/**
 * Fixed-window in-process counter. Returns true when the call is within
 * budget. Best-effort by design — see the module note.
 */
export function checkBurst(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

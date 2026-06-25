import { Resend } from "resend";

/**
 * Transactional email via Resend. Server-only — `RESEND_API_KEY` and
 * `RESEND_FROM_EMAIL` are never exposed to the browser. Like
 * `isSupabaseConfigured()`, callers check `isResendConfigured()` first and
 * degrade gracefully (a friendly error / a non-email fallback) when email isn't
 * set up, so the app still builds and runs without it.
 */
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/** The verified sender address (e.g. "TD Studios <invoices@…>"). */
export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL ?? "";

export function getResend(): Resend {
  if (!isResendConfigured()) {
    throw new Error(
      "Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).",
    );
  }
  return new Resend(process.env.RESEND_API_KEY!);
}

/**
 * Absolute site origin for links in emails. Mirrors the `metadataBase` logic in
 * app/layout.tsx: explicit site URL → Vercel URL → localhost. No trailing slash.
 */
export function getSiteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return url.replace(/\/$/, "");
}

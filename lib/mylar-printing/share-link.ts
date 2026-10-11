import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getSiteUrl } from "@/lib/email/client";

/**
 * Signed, expiring links to ONE mylar inquiry, for the request email.
 *
 * The email goes to `ADMIN_EMAILS` plus the receive-only `MYLAR_INQUIRY_EMAILS`
 * (outside collaborators), and those recipients have no login. The key in the link
 * is the whole authorization for `/mylar-share/[id]` (view + status change) and
 * for `/api/mylar-artwork/[inquiryId]?key=` (downloads): an HMAC over the
 * inquiry id and an expiry, so it opens that request and nothing else, and it
 * cannot be minted without the server secret.
 *
 * Anyone holding the email can use it until it expires — that is the accepted
 * trade for a no-login link. Rotating `SUPABASE_SECRET_KEY` revokes every link.
 */

const SHARE_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// Domain separation: the same secret also signs the gallery keypad cookies.
const SCOPE = "mylar-share:v1";

function shareSecret(): string | null {
  return process.env.SUPABASE_SECRET_KEY ?? null;
}

function sign(inquiryId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${SCOPE}.${inquiryId}.${expiresAt}`)
    .digest("base64url");
}

/** `<expiresAt>.<signature>`, or null when no secret is configured. */
export function createMylarShareKey(inquiryId: string): string | null {
  const secret = shareSecret();
  if (!secret) return null;
  const expiresAt = Date.now() + SHARE_LINK_TTL_MS;
  return `${expiresAt}.${sign(inquiryId, expiresAt, secret)}`;
}

/** Fails closed: no secret, a malformed key, or an expired one is `false`. */
export function verifyMylarShareKey(
  inquiryId: string,
  key: string | null | undefined,
): boolean {
  const secret = shareSecret();
  if (!secret || !key) return false;

  const [rawExpiry, providedSignature, ...extra] = key.split(".");
  if (!rawExpiry || !providedSignature || extra.length > 0) return false;

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  const expected = Buffer.from(sign(inquiryId, expiresAt, secret));
  const provided = Buffer.from(providedSignature);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export function mylarSharePageUrl(inquiryId: string, key: string): string {
  return `${getSiteUrl()}/mylar-share/${inquiryId}?key=${encodeURIComponent(key)}`;
}

/** Relative, for links rendered on the share page itself. */
export function mylarShareArtworkPath(
  inquiryId: string,
  fileId: string,
  key: string,
): string {
  return `/api/mylar-artwork/${inquiryId}?file=${fileId}&key=${encodeURIComponent(key)}`;
}

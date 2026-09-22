import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const SESSION_SECONDS = 8 * 60 * 60;
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
export function signSession(scope: string, secret: string, now = Date.now()) {
  const payload = `v2.${scope}.${now + SESSION_SECONDS * 1000}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(value: string, scope: string, secret: string, now = Date.now()) {
  const [version, gallery, expiry, signature, ...extra] = value.split(".");
  const expires = Number(expiry);
  if (extra.length || version !== "v2" || gallery !== scope || !signature ||
      !Number.isSafeInteger(expires) || expires <= now || expires > now + SESSION_SECONDS * 1000) return false;
  const expected = createHmac("sha256", secret).update(`${version}.${gallery}.${expiry}`).digest("base64url");
  return equalSecret(signature, expected);
}

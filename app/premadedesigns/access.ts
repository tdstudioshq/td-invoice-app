"use server";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import type { ActionState } from "@/app/actions/types";

const ACCESS_CODE = "0420";
const ACCESS_COOKIE = "premade_designs_access";
const COOKIE_VERSION = "v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

type AttemptWindow = { count: number; resetAt: number };
const attemptWindows = new Map<string, AttemptWindow>();

function cookieSecret(): string | null {
  return (
    process.env.PREMADE_GALLERY_COOKIE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

function signCookie(expiresAt: number, secret: string): string {
  const payload = `${COOKIE_VERSION}.${expiresAt}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyCookie(value: string, secret: string): boolean {
  const [version, rawExpiry, providedSignature, ...extra] = value.split(".");
  if (
    version !== COOKIE_VERSION ||
    !rawExpiry ||
    !providedSignature ||
    extra.length > 0
  ) {
    return false;
  }

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${version}.${rawExpiry}`)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

async function attemptKey(): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const address =
    forwardedFor?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  return createHash("sha256")
    .update(`premade-designs:${address}`)
    .digest("hex")
    .slice(0, 24);
}

function allowAttempt(key: string): boolean {
  const now = Date.now();
  if (attemptWindows.size > 500) {
    for (const [storedKey, window] of attemptWindows) {
      if (window.resetAt <= now) attemptWindows.delete(storedKey);
    }
  }

  const window = attemptWindows.get(key);
  if (!window || window.resetAt <= now) {
    attemptWindows.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  window.count += 1;
  return window.count <= ATTEMPT_LIMIT;
}

export async function hasPremadeDesignsAccess(): Promise<boolean> {
  const secret = cookieSecret();
  if (!secret) return false;
  const value = (await cookies()).get(ACCESS_COOKIE)?.value;
  return Boolean(value && verifyCookie(value, secret));
}

export async function enterPremadeDesignsCodeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const key = await attemptKey();
  if (!allowAttempt(key)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (code !== ACCESS_CODE) return { error: "Wrong code. Try again." };

  const secret = cookieSecret();
  if (!secret) return { error: "Gallery access is not configured." };

  const expiresAt = Date.now() + COOKIE_MAX_AGE * 1000;
  (await cookies()).set(ACCESS_COOKIE, signCookie(expiresAt, secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/premadedesigns",
    maxAge: COOKIE_MAX_AGE,
  });
  attemptWindows.delete(key);
  revalidatePath("/premadedesigns");
  return { success: true };
}

export async function lockPremadeDesignsAction(): Promise<void> {
  (await cookies()).set(ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/premadedesigns",
    maxAge: 0,
  });
  revalidatePath("/premadedesigns");
}

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

import type { ActionState } from "@/app/actions/types";

/**
 * Shared keypad gate for the semi-private galleries.
 *
 * Six routes had copy-pasted this in two shapes — four with a plain
 * `granted` cookie and two with an HMAC-signed one — differing only in cookie
 * name, path and function names. Both shapes live here now, and each route's
 * `access.ts` is a thin `"use server"` wrapper (that file format may only
 * export async functions, so the factories cannot live there).
 *
 * The two shapes are deliberately NOT merged into one: the signed gate sets a
 * different cookie format and `sameSite`, so folding the plain four onto it
 * would invalidate every live unlock cookie and force visitors to re-enter the
 * code. Upgrading them is a behavior change to make on purpose, not a
 * side effect of deduplication.
 *
 * This is a shared-passcode vibe lock, not account auth. Real enforcement for
 * anything sensitive is Postgres RLS plus the `require*()` helpers.
 */

/** One code across every gallery, as before — now rotatable without a deploy. */
const ACCESS_CODE = process.env.GALLERY_ACCESS_CODE ?? "0420";

const COOKIE_VALUE = "granted";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SimpleGate {
  has(): Promise<boolean>;
  enter(previous: ActionState, formData: FormData): Promise<ActionState>;
}

export interface SignedGate extends SimpleGate {
  lock(): Promise<void>;
}

/**
 * Plain-cookie gate: `/taste-budz`, `/designs`, `/mafiaterpz`, `/martyig`.
 * The cookie value is a literal, so it hides the listing rather than
 * authenticating anyone.
 */
export function createSimpleGalleryGate(config: {
  cookieName: string;
  path: string;
}): SimpleGate {
  const { cookieName, path } = config;

  return {
    async has() {
      const store = await cookies();
      return store.get(cookieName)?.value === COOKIE_VALUE;
    },

    async enter(_previous: ActionState, formData: FormData) {
      const code = String(formData.get("code") ?? "").trim();
      if (code !== ACCESS_CODE) {
        return { error: "Wrong code. Try again." };
      }
      const store = await cookies();
      store.set(cookieName, COOKIE_VALUE, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path,
        maxAge: COOKIE_MAX_AGE,
      });
      revalidatePath(path);
      return { success: true };
    },
  };
}

// --- signed variant -------------------------------------------------------

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 10;

type AttemptWindow = { count: number; resetAt: number };

function cookieSecret(): string | null {
  return (
    process.env.PREMADE_GALLERY_COOKIE_SECRET ??
    process.env.SUPABASE_SECRET_KEY ??
    null
  );
}

function signCookie(
  version: string,
  expiresAt: number,
  secret: string,
): string {
  const payload = `${version}.${expiresAt}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyCookie(
  value: string,
  version: string,
  secret: string,
): boolean {
  const [cookieVersion, rawExpiry, providedSignature, ...extra] =
    value.split(".");
  if (
    cookieVersion !== version ||
    !rawExpiry ||
    !providedSignature ||
    extra.length > 0
  ) {
    return false;
  }

  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;

  const expectedSignature = createHmac("sha256", secret)
    .update(`${cookieVersion}.${rawExpiry}`)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

async function attemptKey(label: string): Promise<string> {
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const address =
    forwardedFor?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  return createHash("sha256")
    .update(`${label}:${address}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * HMAC-signed gate: `/premadedesigns`. Fails closed when
 * neither `PREMADE_GALLERY_COOKIE_SECRET` nor `SUPABASE_SECRET_KEY` is set.
 * `attemptWindows` is per-gate, matching the previous per-module Maps.
 */
export function createSignedGalleryGate(config: {
  cookieName: string;
  cookieVersion: string;
  path: string;
  /** Salts the hashed client address for this gate's rate limiter. */
  rateLimitLabel: string;
}): SignedGate {
  const { cookieName, cookieVersion, path, rateLimitLabel } = config;
  const attemptWindows = new Map<string, AttemptWindow>();

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

  return {
    async has() {
      const secret = cookieSecret();
      if (!secret) return false;
      const value = (await cookies()).get(cookieName)?.value;
      return Boolean(value && verifyCookie(value, cookieVersion, secret));
    },

    async enter(_previous: ActionState, formData: FormData) {
      const key = await attemptKey(rateLimitLabel);
      if (!allowAttempt(key)) {
        return { error: "Too many attempts. Try again in a few minutes." };
      }

      const code = String(formData.get("code") ?? "").trim();
      if (code !== ACCESS_CODE) return { error: "Wrong code. Try again." };

      const secret = cookieSecret();
      if (!secret) return { error: "Gallery access is not configured." };

      const expiresAt = Date.now() + COOKIE_MAX_AGE * 1000;
      (await cookies()).set(
        cookieName,
        signCookie(cookieVersion, expiresAt, secret),
        {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          path,
          maxAge: COOKIE_MAX_AGE,
        },
      );
      attemptWindows.delete(key);
      revalidatePath(path);
      return { success: true };
    },

    async lock() {
      (await cookies()).set(cookieName, "", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path,
        maxAge: 0,
      });
      revalidatePath(path);
    },
  };
}

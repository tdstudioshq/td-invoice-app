"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { getPartnerContext } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ActionState } from "@/app/actions/types";

/**
 * Keypad gate for a print-partner portal.
 *
 * WHAT THIS IS, EXACTLY. The rep types a 4-digit code instead of an email and
 * password — but the code does not *replace* authentication, it unlocks it: on
 * a correct code the server signs in as that company's shared portal account
 * and the browser gets a real Supabase session. Everything downstream is
 * therefore untouched — RLS still scopes every read to the company, the storage
 * policies still pin uploads to its prefix, `create_design_job` still runs
 * under the caller's own privileges, and status changes remain impossible from
 * the portal because no UPDATE policy exists.
 *
 * The alternative — dropping the session and reading through the service-role
 * client behind a cookie — would have moved the entire company boundary out of
 * Postgres and into application code. This keeps the database as the enforcer.
 *
 * WHAT IT COSTS, deliberately: one shared identity per company. Anyone with the
 * link and the code is "Zaza", so jobs are attributed to the company rather
 * than to a person. That is inherent in a shared code, not in this
 * implementation — issuing per-rep logins later is just `partner_users` rows
 * plus swapping this page back to a password form.
 *
 * Credentials live in server-only env vars and are never sent to the browser.
 * When they are absent the gate fails CLOSED.
 */

/** What the gate needs, however it was submitted. */
type CodeInput = FormData | Record<string, unknown> | undefined;

interface PortalAccess {
  /** The 4-digit keypad code. Constant, like the other keypad gates here. */
  code: string;
  emailEnv: string;
  passwordEnv: string;
}

/**
 * One entry per partner company, keyed by slug. Adding a second company is a
 * row in `partner_companies`, an entry here, and its two env vars — still no
 * new route.
 */
const PORTAL_ACCESS: Record<string, PortalAccess> = {
  zaza: {
    code: "0420",
    emailEnv: "ZAZA_PORTAL_EMAIL",
    passwordEnv: "ZAZA_PORTAL_PASSWORD",
  },
};

/** Whether this portal is reachable by keypad at all. */
export async function portalUsesKeypad(slug: string): Promise<boolean> {
  return Boolean(PORTAL_ACCESS[slug]);
}

// --- Attempt throttling -----------------------------------------------------
// A 4-digit code is 10,000 combinations, so an unthrottled endpoint is
// brute-forceable in minutes. Same in-process window as the /premadedesigns
// gate: enough to make guessing impractical without a datastore.
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const ATTEMPT_LIMIT = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

async function attemptKey(slug: string): Promise<string> {
  const headerList = await headers();
  const address =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  return createHash("sha256")
    .update(`partner-portal:${slug}:${address}`)
    .digest("hex")
    .slice(0, 24);
}

function allowAttempt(key: string): boolean {
  const now = Date.now();
  if (attempts.size > 500) {
    for (const [k, w] of attempts) if (w.resetAt <= now) attempts.delete(k);
  }
  const window = attempts.get(key);
  if (!window || window.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return true;
  }
  if (window.count >= ATTEMPT_LIMIT) return false;
  window.count += 1;
  return true;
}

/** Constant-time-ish compare so a wrong code leaks nothing through timing. */
function codeMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const GENERIC = "Wrong code. Try again.";

/**
 * Verify the keypad code and, on success, establish the portal session.
 *
 * Returns `{ success: true }` rather than redirecting: the keypad component
 * calls this from a transition and the page re-renders once the session cookie
 * is set, which keeps the address bar on the portal's own hostname.
 */
export async function enterPartnerCodeAction(
  prevOrInput: ActionState | CodeInput,
  maybeInput?: CodeInput,
): Promise<ActionState> {
  // Callable three ways, all reading the same two fields: imperatively as
  // `action(prevState, formData)` (how the keypad component calls it, matching
  // the other gates here), as a bare `<form action={...}>` where React passes
  // the FormData alone, and with a plain object. Normalizing here keeps the
  // gate working with JavaScript disabled and keeps it directly testable.
  const input = (maybeInput ?? prevOrInput) as CodeInput;
  const read = (name: string): string =>
    String(
      (input instanceof FormData
        ? input.get(name)
        : (input as Record<string, unknown> | undefined)?.[name]) ?? "",
    ).trim();

  // The slug rides in the payload rather than being bound into the action. A
  // caller can therefore choose WHICH portal to try, which grants nothing: they
  // still need that portal's code, and the membership re-check below still ties
  // the resulting session to that same company.
  const slug = read("slug");
  const code = read("code");
  const access = PORTAL_ACCESS[slug];
  if (!access || !isSupabaseConfigured()) return { error: GENERIC };

  if (!allowAttempt(await attemptKey(slug))) {
    return { error: "Too many tries. Wait a few minutes and try again." };
  }

  if (!codeMatches(code, access.code)) return { error: GENERIC };

  const email = process.env[access.emailEnv];
  const password = process.env[access.passwordEnv];
  if (!email || !password) {
    // Fail closed, and say so plainly — this is a deployment problem, not a
    // wrong code, and the studio needs to hear about it rather than watch reps
    // retype a code that can never work.
    console.error(
      `partner portal ${slug}: ${access.emailEnv}/${access.passwordEnv} are not set`,
    );
    return { error: "This portal isn't set up yet. Text TD Studios." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(`partner portal ${slug} sign-in`, error.message);
    return { error: "Couldn't open the portal. Try again in a moment." };
  }

  // The session must actually map to THIS company; a mismatch means the env
  // vars point at the wrong account, which would otherwise hand one partner
  // another's jobs.
  const partner = await getPartnerContext();
  if (!partner || partner.companySlug !== slug) {
    await supabase.auth.signOut();
    console.error(`partner portal ${slug}: account is not a member of ${slug}`);
    return { error: "This portal isn't set up yet. Text TD Studios." };
  }

  return { success: true };
}

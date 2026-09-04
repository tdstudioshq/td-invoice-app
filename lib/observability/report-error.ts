/**
 * The one place an unexpected error becomes a log line.
 *
 * WHY A SEAM RATHER THAN A PROVIDER. There is no monitoring service in this
 * project and this module deliberately does not add one — it adds the single
 * function a provider would later be wired into. `deliver()` at the bottom is
 * that hook: a Sentry/Datadog/OTel call goes there and nothing else in the app
 * changes. Until then it is `console.*`, which on Vercel lands in function
 * logs, matching where every other error in this codebase already goes.
 *
 * WHY THIS IS NOT APPLIED TO EVERY `console.error`. Around 115 of them exist,
 * and the overwhelming majority already follow a good convention:
 *
 *     console.error("getClients", error.message);   // then return []
 *
 * That logs an operation name and a Postgres message, never the error object,
 * and the caller degrades gracefully — it is the graceful-degradation pattern
 * CLAUDE.md documents, and rewriting it would be churn with no security or
 * architectural gain. This module is used where the old call was ACTIVELY
 * unsafe or lossy instead: the error boundaries (which had a bare
 * `console.error(error)` plus a TODO), and the Storage cleanup paths that
 * logged customer filenames. Everything else was left exactly as it was.
 *
 * ISOMORPHIC ON PURPOSE. The `error.tsx` boundaries are Client Components, so
 * this file must not be `server-only`. It therefore holds no secrets, reads no
 * env vars, and touches no Node API — it only ever shapes data it is handed.
 */

/** What actually gets logged. Nothing else about the error survives. */
export type ErrorReport = {
  scope: string;
  name: string;
  message: string;
  /** Postgres/PostgREST `code`, or a fetch status — safe, and the useful bit. */
  code?: string;
  /** Next's server-error hash. The ONLY id worth showing a user. */
  digest?: string;
};

/**
 * Keys whose VALUE is never logged, whatever it holds.
 *
 * Matched as a substring so `supabaseKey`, `access_token` and
 * `authorizationHeader` are all covered without enumerating spellings.
 */
const SENSITIVE_KEY =
  /(key|token|secret|password|passwd|cookie|authorization|auth|apikey|jwt|session|bearer|credential|signature|email|phone|address|card|ssn)/i;

/** Values that look like a credential even under an innocent key name. */
const SENSITIVE_VALUE = [
  /^ey[A-Za-z0-9_-]{8,}\./, // JWT
  /^sb[ps]?_[A-Za-z0-9_-]{16,}$/, // Supabase publishable/secret key
  /^[A-Fa-f0-9]{32,}$/, // hex secret / hash
];

const REDACTED = "[redacted]";
const MAX_STRING = 200;

/**
 * Supabase errors carry `details` and `hint` alongside `message`, and those two
 * echo ROW VALUES back — a unique-violation detail reads
 * `Key (email)=(someone@example.com) already exists`. That is customer data, so
 * only `message` and `code` are ever read off an error here.
 */
function readErrorFields(error: unknown): {
  name: string;
  message: string;
  code?: string;
  digest?: string;
} {
  if (error instanceof Error) {
    const extra = error as Error & { code?: unknown; digest?: unknown };
    return {
      name: error.name || "Error",
      message: error.message || "(no message)",
      code: typeof extra.code === "string" ? extra.code : undefined,
      digest: typeof extra.digest === "string" ? extra.digest : undefined,
    };
  }
  if (error && typeof error === "object") {
    const shape = error as Record<string, unknown>;
    return {
      name: typeof shape.name === "string" ? shape.name : "UnknownError",
      message:
        typeof shape.message === "string" ? shape.message : "(no message)",
      code: typeof shape.code === "string" ? shape.code : undefined,
      digest: typeof shape.digest === "string" ? shape.digest : undefined,
    };
  }
  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "(non-error thrown)",
  };
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (SENSITIVE_VALUE.some((pattern) => pattern.test(value))) return REDACTED;
    // Query strings are where Storage signed-URL tokens live.
    if (/^https?:\/\//i.test(value)) {
      const cut = value.indexOf("?");
      return cut === -1 ? value : `${value.slice(0, cut)}?${REDACTED}`;
    }
    return value.length > MAX_STRING
      ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING})`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value === null || value === undefined) return value;
  return "[object]";
}

/**
 * Flatten a context object to primitives, dropping anything sensitive.
 *
 * Deliberately one level deep: nested objects become `[object]` rather than
 * being walked, so a whole Supabase client or request never serializes itself
 * into a log line by accident.
 */
export function redactContext(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    safe[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(value);
  }
  return safe;
}

/**
 * Describe a batch of Storage object keys without naming any of them.
 *
 * A key is `{ownerId}/{uuid}-{customer's original filename}`, so logging the
 * raw array publishes both a private path prefix and what the customer called
 * their artwork. The count and the extensions are what a person debugging a
 * failed cleanup actually needs.
 */
export function summarizePaths(paths: readonly string[]): {
  count: number;
  kinds: string;
} {
  const kinds = new Set<string>();
  for (const path of paths) {
    const dot = path.lastIndexOf(".");
    kinds.add(dot === -1 ? "none" : path.slice(dot + 1).toLowerCase());
  }
  return { count: paths.length, kinds: [...kinds].sort().join(",") || "none" };
}

/**
 * Report an unexpected error.
 *
 * `scope` is the operation name, matching the `console.error("getClients", …)`
 * convention already used across `lib/` so log greps keep working. Returns the
 * report so a caller can surface `digest` in the UI — that hash is the only
 * safe way to connect what a user saw to what the server logged.
 */
export function reportError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>,
): ErrorReport {
  const fields = readErrorFields(error);
  const report: ErrorReport = { scope, ...fields };
  deliver(report, context ? redactContext(context) : undefined);
  return report;
}

/**
 * The provider seam. Swap the body, not the call sites.
 *
 * Kept as a plain `console.error` so the line stays greppable next to the ~115
 * that were intentionally left alone, and so nothing here can throw inside an
 * error boundary — a reporter that fails while reporting takes the fallback UI
 * down with it.
 */
function deliver(report: ErrorReport, context?: Record<string, unknown>) {
  try {
    const tags = [
      report.code && `code=${report.code}`,
      report.digest && `digest=${report.digest}`,
    ]
      .filter(Boolean)
      .join(" ");
    console.error(
      `[${report.scope}] ${report.name}: ${report.message}${tags ? ` (${tags})` : ""}`,
      context ?? "",
    );
  } catch {
    // Reporting must never be the thing that breaks.
  }
}

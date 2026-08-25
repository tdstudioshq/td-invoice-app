/**
 * Hostname / path resolution for the print-partner portals.
 *
 * The portal lives at ONE internal namespace — `/partner/<slug>/…` — and is
 * reached three ways, all resolved here and nowhere else:
 *
 *   1. its own subdomain      zazaorders.tdstudiosny.com/jobs
 *   2. a main-domain alias    tdstudiosny.com/zaza-orders/jobs
 *   3. the internal path      tdstudiosny.com/partner/zaza/jobs   (dev, admin)
 *
 * Adding a second print company is a `partner_companies` row plus ONE entry in
 * `PARTNER_SUBDOMAINS` below (and optionally one in `PARTNER_PATH_ALIASES`).
 * There is no per-company route folder: `app/(partner)/partner/[slug]` serves
 * all of them, which is why (3) accepts any well-formed slug without a code
 * change — only the pretty entry points need registering.
 *
 * IMPORT CONSTRAINT: this module is imported by `proxy.ts`, so it must stay
 * dependency-free — no `server-only`, no Supabase, no `next/headers`.
 */

/** Internal route namespace. Every partner page really lives under here. */
export const PARTNER_ROUTE_ROOT = "/partner";

/**
 * Leftmost hostname label -> partner company slug.
 * Matching on the label (rather than the full host) means the same entry covers
 * production (`zazaorders.tdstudiosny.com`) and local development
 * (`zazaorders.localhost:3000`) with no environment branching.
 */
export const PARTNER_SUBDOMAINS: Record<string, string> = {
  zazaorders: "zaza",
};

/**
 * Main-domain path alias -> partner company slug. Keeps the portal reachable
 * (and linkable) before its subdomain is attached in Vercel, and gives local
 * development a URL that needs no hosts-file entry.
 */
export const PARTNER_PATH_ALIASES: Record<string, string> = {
  "/zaza-orders": "zaza",
};

/** Slug shape accepted on the internal `/partner/<slug>` path. Mirrors the SQL check. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export interface PartnerRoute {
  /** The partner company slug this request is for. */
  slug: string;
  /**
   * The base every in-portal link must be built from, in EXTERNAL terms:
   * `""` on the subdomain, `"/zaza-orders"` via the alias, `"/partner/zaza"`
   * on the internal path. Keeps the address bar honest — a subdomain visitor
   * never sees `/partner/zaza` appear in their URL.
   */
  basePath: string;
  /** The internal app path to render. Equal to the request path when no rewrite is needed. */
  internalPath: string;
  /** Path within the portal, always leading-slashed: `/`, `/login`, `/jobs/x`. */
  subPath: string;
  /** How this request reached the portal — the proxy forwards it as a header. */
  via: "subdomain" | "alias" | "internal";
}

/** The partner slug a hostname maps to, or null for every other host. */
export function partnerSlugForHost(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  const host = hostname.split(":")[0].trim().toLowerCase();
  const labels = host.split(".");
  // Require a dot so a bare host named exactly like a subdomain can't match.
  if (labels.length < 2) return null;
  return PARTNER_SUBDOMAINS[labels[0]] ?? null;
}

function joinPortalPath(slug: string, subPath: string): string {
  const suffix = subPath === "/" ? "" : subPath;
  return `${PARTNER_ROUTE_ROOT}/${slug}${suffix}`;
}

/** Normalize a possibly-empty remainder into a leading-slashed sub path. */
function normalizeSubPath(rest: string): string {
  if (!rest || rest === "/") return "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/**
 * Resolve an incoming (hostname, pathname) to the partner route it addresses,
 * or null when the request has nothing to do with a partner portal — which is
 * every request to the main site, and is why this is safe to call on all of
 * them.
 */
export function resolvePartnerRoute(
  hostname: string | null | undefined,
  pathname: string,
): PartnerRoute | null {
  const hostSlug = partnerSlugForHost(hostname);

  if (hostSlug) {
    // On the partner's own subdomain the whole path belongs to the portal. The
    // one exception is a path that ALREADY names the internal namespace, which
    // happens when a shared/internal link is opened on the subdomain — strip it
    // rather than nesting `/partner/zaza/partner/zaza/…`.
    const internalPrefix = `${PARTNER_ROUTE_ROOT}/${hostSlug}`;
    const subPath =
      pathname === internalPrefix || pathname.startsWith(`${internalPrefix}/`)
        ? normalizeSubPath(pathname.slice(internalPrefix.length))
        : normalizeSubPath(pathname);
    return {
      slug: hostSlug,
      basePath: "",
      internalPath: joinPortalPath(hostSlug, subPath),
      subPath,
      via: "subdomain",
    };
  }

  for (const [alias, slug] of Object.entries(PARTNER_PATH_ALIASES)) {
    if (pathname === alias || pathname.startsWith(`${alias}/`)) {
      const subPath = normalizeSubPath(pathname.slice(alias.length));
      return {
        slug,
        basePath: alias,
        internalPath: joinPortalPath(slug, subPath),
        subPath,
        via: "alias",
      };
    }
  }

  if (pathname === PARTNER_ROUTE_ROOT || pathname.startsWith(`${PARTNER_ROUTE_ROOT}/`)) {
    const [, , slug, ...rest] = pathname.split("/");
    if (slug && SLUG_PATTERN.test(slug)) {
      const subPath = normalizeSubPath(rest.join("/"));
      return {
        slug,
        basePath: `${PARTNER_ROUTE_ROOT}/${slug}`,
        internalPath: pathname,
        subPath,
        via: "internal",
      };
    }
  }

  return null;
}

/** Portal paths reachable without a session. Everything else needs one. */
const PUBLIC_SUB_PATHS = new Set(["/login"]);

export function isPublicPartnerSubPath(subPath: string): boolean {
  return PUBLIC_SUB_PATHS.has(subPath);
}

/**
 * Request headers the proxy stamps on a rewritten partner request so the
 * rendered page can rebuild EXTERNAL links (see `partnerBasePath()` in
 * lib/partner-jobs/context.ts). The proxy deletes them from every incoming
 * request first, so a client cannot forge them.
 */
export const PARTNER_VIA_HEADER = "x-td-partner-via";
export const PARTNER_BASE_HEADER = "x-td-partner-base";

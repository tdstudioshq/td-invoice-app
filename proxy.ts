import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  PARTNER_BASE_HEADER,
  PARTNER_VIA_HEADER,
  isPublicPartnerSubPath,
  resolvePartnerRoute,
} from "@/lib/partner-jobs/routing";

// Next.js 16 renamed Middleware to Proxy (same functionality, Node.js runtime).
// This proxy does three things on every matched request:
//   1. Refreshes the Supabase auth session (rotating cookies) so Server
//      Components and Server Actions see a valid, current user.
//   2. Maps a print-partner hostname or path alias onto the internal
//      /partner/<slug>/… routes (see the Partner portals block below).
//   3. Redirects unauthenticated users away from protected pages, and
//      authenticated users away from the login page.
//
// Note: this is an optimistic gate. Real enforcement lives in Postgres RLS and
// in `requireUser()` inside Server Components/Actions — never trust the proxy
// alone (see Next.js "Data Security" guidance).

// Public paths that do not require a session. `/reset-password` must be public:
// the recovery link arrives with the session in the URL hash (not a cookie), so
// the page has to load client-side to read it — redirecting would strip it.
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/login",
  "/sign-up",
  "/reset-password",
  // OAuth code exchange — must be reachable mid-flow, before cookies exist.
  "/auth/callback",
  "/qr-generator",
  "/premadedesigns",
  "/custom-design-request",
  "/how-to-order",
  "/mylar-bag-printing",
  "/mylar-printing",
  "/portfolio",
  "/taste-budz",
  "/gso",
  "/designs",
  "/martyig",
  "/mafiaterpz",
  "/tools/cutline-generator",
  "/tools/mockup-generator",
  "/tools/8pc-mockup-generator",
  "/tools/bag-mockup-grid",
  // The static mylar shop (public/mylar/index.html): /mylar is the rewritten
  // clean URL, and the direct file path must pass too since the matcher only
  // skips image extensions, not .html.
  "/mylar",
  "/mylar/index.html",
]);

/** The hostname this request was actually addressed to, behind any Vercel proxy. */
function requestHostname(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.hostname
  );
}

/**
 * Redirect to one of our own paths, staying on the hostname the visitor used.
 *
 * `new URL(path, request.url)` is not good enough for the partner portals: the
 * host a portal is RECOGNISED by comes from `x-forwarded-host`/`host`, while
 * `request.url` can be built from the origin the server is listening on. When
 * those disagree — and behind a proxy they can — a rep on
 * zazaorders.tdstudiosny.com gets bounced onto the main site's login instead of
 * their own. Deriving both from the same headers is what keeps the rewrite and
 * the redirect talking about the same host.
 *
 * Not an open-redirect surface: the path is always one this file supplies, and
 * the host is the one the browser itself asked for — a browser cannot be made to
 * send someone else's Host header.
 */
function redirectWithinHost(request: NextRequest, pathWithQuery: string) {
  const url = request.nextUrl.clone();
  const host = requestHostname(request);
  if (host) url.host = host;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) url.protocol = `${proto.split(",")[0].trim()}:`;
  const [pathname, search = ""] = pathWithQuery.split("?");
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Cookies Supabase wants to rotate. Collected rather than written straight to
  // a response, because which response we return (next / rewrite / redirect)
  // isn't known until after the session has been read — and a refreshed session
  // must survive all three.
  const refreshedCookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];

  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          refreshedCookies.push(
            ...(cookiesToSet as typeof refreshedCookies),
          );
        },
      },
    });

    // IMPORTANT: do not run code between createServerClient and getUser().
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return finish(request, user !== null, refreshedCookies);
  }

  // Without Supabase configured there is nothing to enforce; let the app run in
  // its empty-state "demo" mode (consistent with isSupabaseConfigured()). The
  // partner rewrite still runs, so the portal renders its own empty states
  // rather than 404ing.
  return finish(request, false, refreshedCookies);
}

function finish(
  request: NextRequest,
  signedIn: boolean,
  refreshedCookies: { name: string; value: string; options: Record<string, unknown> }[],
) {
  const { pathname } = request.nextUrl;

  // Rebuild the forwarded request headers AFTER any cookie rotation above, then
  // strip the partner headers so a client can never supply its own. Only this
  // function sets them.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(PARTNER_VIA_HEADER);
  requestHeaders.delete(PARTNER_BASE_HEADER);

  const apply = (response: NextResponse) => {
    for (const { name, value, options } of refreshedCookies) {
      response.cookies.set(name, value, options);
    }
    return response;
  };

  // --- Partner portals -----------------------------------------------------
  // zazaorders.tdstudiosny.com/jobs, tdstudiosny.com/zaza-orders/jobs and
  // tdstudiosny.com/partner/zaza/jobs are three addresses for ONE route. The
  // resolver decides which (if any) applies; it returns null for every request
  // to the main site, which is why it is safe to run on all of them.
  const partner = resolvePartnerRoute(requestHostname(request), pathname);
  if (partner) {
    // How the portal was reached, so the rendered page can rebuild links in the
    // caller's own terms and keep `/partner/<slug>` out of a subdomain visitor's
    // address bar (see partnerBasePath() in lib/partner-jobs/context.ts).
    requestHeaders.set(PARTNER_VIA_HEADER, partner.via);
    if (partner.via === "alias") {
      requestHeaders.set(PARTNER_BASE_HEADER, partner.basePath);
    }

    const isLogin = isPublicPartnerSubPath(partner.subPath);
    if (!signedIn && !isLogin) {
      const wanted = `${partner.basePath}${partner.subPath === "/" ? "/jobs" : partner.subPath}`;
      return apply(
        redirectWithinHost(
          request,
          `${partner.basePath}/login?redirect=${encodeURIComponent(wanted)}`,
        ),
      );
    }
    if (signedIn && isLogin) {
      return apply(redirectWithinHost(request, `${partner.basePath}/jobs`));
    }

    // Only rewrite when the address differs from the route — a direct hit on
    // /partner/<slug>/… is already where it needs to be.
    if (partner.internalPath !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = partner.internalPath;
      return apply(
        NextResponse.rewrite(url, { request: { headers: requestHeaders } }),
      );
    }
    return apply(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  // --- Main site -----------------------------------------------------------
  // `/q/<slug>` is the public dynamic-QR redirect — it must be reachable
  // without a session.
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/q/");

  if (!signedIn && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return apply(NextResponse.redirect(loginUrl));
  }

  // Authenticated users shouldn't see the auth pages. Send them to /dashboard;
  // non-admins are then routed on to their own area by requireAdmin (optimistic
  // gate — the real role decision lives in the Server Components).
  if (signedIn && (pathname === "/login" || pathname === "/sign-up")) {
    return apply(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return apply(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // Run on everything except API routes (they self-authenticate with the
  // secret key), Next internals, the PWA manifest, and static image assets
  // (icons must load without a session, e.g. on the login page).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

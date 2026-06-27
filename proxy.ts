import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed Middleware to Proxy (same functionality, Node.js runtime).
// This proxy does two things on every matched request:
//   1. Refreshes the Supabase auth session (rotating cookies) so Server
//      Components and Server Actions see a valid, current user.
//   2. Redirects unauthenticated users away from protected pages, and
//      authenticated users away from the login page.
//
// Note: this is an optimistic gate. Real enforcement lives in Postgres RLS and
// in `requireUser()` inside Server Components/Actions — never trust the proxy
// alone (see Next.js "Data Security" guidance).

// Public paths that do not require a session. `/reset-password` must be public:
// the recovery link arrives with the session in the URL hash (not a cookie), so
// the page has to load client-side to read it — redirecting would strip it.
const PUBLIC_PATHS = new Set<string>(["/", "/login", "/reset-password"]);

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured there is nothing to enforce; let the app run
  // in its empty-state "demo" mode (consistent with isSupabaseConfigured()).
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // `/q/<slug>` is the public dynamic-QR redirect — anyone scanning a code must
  // reach it without a session, so it's public alongside PUBLIC_PATHS.
  const isPublic = PUBLIC_PATHS.has(pathname) || pathname.startsWith("/q/");

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Run on everything except API routes (they self-authenticate with the
  // secret key), Next internals, the PWA manifest, and static image assets
  // (icons must load without a session, e.g. on the login page).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

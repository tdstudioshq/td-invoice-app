import { NextResponse, type NextRequest } from "next/server";

import { roleHome } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * OAuth (PKCE) callback: Google bounces back to Supabase, which redirects here
 * with a one-time `code`. Exchange it for a session (sets the auth cookies via
 * the SSR client), then land the user on their role home — same routing as
 * signInAction. `redirect` carries the original in-app destination through the
 * OAuth round-trip; only same-origin, in-app paths are honored.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const loginError = (message: string) =>
    NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`,
    );

  if (!isSupabaseConfigured() || !code) {
    return loginError("Google sign-in failed. Please try again.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return loginError(error?.message ?? "Google sign-in failed.");
  }

  const target = searchParams.get("redirect") ?? "";
  const safeTarget =
    target.startsWith("/") && !target.startsWith("//") && target !== "/login"
      ? target
      : await roleHome(data.user);
  return NextResponse.redirect(`${origin}${safeTarget}`);
}

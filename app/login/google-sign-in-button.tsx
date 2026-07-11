"use client";

import { useState } from "react";
import { GoogleLogoIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Kicks off the Supabase Google OAuth flow (PKCE). The browser is sent to
 * Google, back through Supabase, and finally to /auth/callback, which
 * exchanges the code for a session and routes the user to their role home.
 */
export function GoogleSignInButton({
  redirectTo,
  className,
  label = "Continue with Google",
}: {
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    const callback = new URL("/auth/callback", window.location.origin);
    if (redirectTo) callback.searchParams.set("redirect", redirectTo);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      toast.error(error.message);
      setPending(false);
    }
    // On success the browser navigates away to Google — no state to reset.
  };

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      className={cn(
        className ??
          "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.05] text-sm font-medium text-white transition-all hover:border-white/25 hover:bg-white/[0.1] active:translate-y-px",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {pending ? (
        <SpinnerGapIcon className="size-4.5 animate-spin" />
      ) : (
        <GoogleLogoIcon weight="bold" className="size-4.5" />
      )}
      {label}
    </button>
  );
}

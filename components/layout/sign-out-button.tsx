"use client";

import { SignOut } from "@phosphor-icons/react";

import { signOutAction } from "@/app/actions/auth";

/**
 * Sign-out control. Posts to the `signOutAction` Server Action, which clears the
 * Supabase session and redirects to /login.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-left text-xs transition-colors"
      >
        <SignOut className="size-4" />
        Sign out
      </button>
    </form>
  );
}

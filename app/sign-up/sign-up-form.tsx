"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircleIcon } from "@phosphor-icons/react";

import { signUpAction } from "@/app/actions/profile";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]";

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialActionState);

  // Email-confirmation pending: signUpAction redirects to /onboarding when a
  // session is issued immediately, so a `success` state means "confirm first".
  if (state.success) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md">
        <CheckCircleIcon weight="fill" className="size-12 text-emerald-400" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            We sent you a confirmation link. Click it to activate your account,
            then you&apos;ll be taken to set up your profile.
          </p>
        </div>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
        >
          Back to TD Studios
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      {state.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-white">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={fieldClass}
        />
        {state.fieldErrors?.email ? (
          <p className="text-destructive text-xs">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-white">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={fieldClass}
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm_password" className="text-white">
          Confirm password
        </Label>
        <Input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Re-enter your password"
          aria-invalid={Boolean(state.fieldErrors?.confirm_password)}
          className={fieldClass}
        />
        {state.fieldErrors?.confirm_password ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.confirm_password}
          </p>
        ) : null}
      </div>

      <SubmitButton
        pendingText="Creating account…"
        className="h-11 w-full rounded-xl bg-white text-neutral-900 hover:bg-white/90"
      >
        Create account
      </SubmitButton>

      <p className="text-muted-foreground text-center text-xs">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

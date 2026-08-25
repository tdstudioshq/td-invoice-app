"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { signInPartnerAction } from "@/app/actions/partner-auth";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sign-in form for a partner portal. Same `useActionState` + sonner shape as
 * the public LoginForm, minus the Google button and the "create an account"
 * link — a partner login is provisioned, never self-claimed.
 *
 * `slug` and `basePath` ride along as hidden fields so the action can verify
 * membership of THIS company and send the rep to a path that is correct for
 * however they reached the portal (bare on the subdomain, prefixed via the
 * alias).
 */
export function PartnerLoginForm({
  slug,
  basePath,
  redirectTo,
}: {
  slug: string;
  basePath: string;
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(
    signInPartnerAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="basePath" value={basePath} />
      {redirectTo ? (
        <input type="hidden" name="redirect" value={redirectTo} />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="partner-email">Email</Label>
        <Input
          id="partner-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className="h-11"
        />
        {state.fieldErrors?.email ? (
          <p className="text-destructive text-xs">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-password">Password</Label>
        <Input
          id="partner-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className="h-11"
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <SubmitButton pendingText="Signing in…" className="h-11 w-full">
        Sign in
      </SubmitButton>
    </form>
  );
}

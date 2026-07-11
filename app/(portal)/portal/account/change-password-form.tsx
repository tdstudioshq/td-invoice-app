"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { changePasswordAction } from "@/app/actions/portal-client";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * In-session password change for a portal user. Validation mirrors the
 * /reset-password form (min 8 chars + confirmation); the server action
 * re-validates and clears the must-change-password flag on success.
 */
export function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(
    changePasswordAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Password updated");
      formRef.current?.reset();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="max-w-sm space-y-4">
      {mustChange ? (
        <p className="text-muted-foreground text-sm">
          You must set a new password before using the portal.
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        {state.fieldErrors?.confirm ? (
          <p className="text-destructive text-xs">{state.fieldErrors.confirm}</p>
        ) : null}
      </div>
      <SubmitButton pendingText="Updating…">Update password</SubmitButton>
    </form>
  );
}

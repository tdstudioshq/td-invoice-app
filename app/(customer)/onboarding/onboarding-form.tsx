"use client";

import { useActionState } from "react";

import { completeOnboardingAction } from "@/app/actions/profile";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-black/35 px-3.5 dark:bg-black/35";

/**
 * The fallback half of signup, reached only when email confirmation is ON — the
 * signup form asks for these same two fields, but Supabase issues no session at
 * that point, so there is no authenticated identity to write the profile under.
 * `defaultFullName` / `defaultBusinessName` come back from the auth user's
 * metadata, making this a confirm-and-continue rather than a second form.
 */
export function OnboardingForm({
  email,
  defaultFullName,
  defaultBusinessName,
}: {
  email: string | null;
  defaultFullName?: string;
  defaultBusinessName?: string;
}) {
  const [state, formAction] = useActionState(
    completeOnboardingAction,
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-black/40 p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      {state.error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="full_name" className="text-white">
          Your name
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          defaultValue={defaultFullName}
          placeholder="Your full name"
          aria-invalid={Boolean(state.fieldErrors?.full_name)}
          className={fieldClass}
        />
        {state.fieldErrors?.full_name ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.full_name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="business_name" className="text-white">
          Business name
        </Label>
        <Input
          id="business_name"
          name="business_name"
          type="text"
          autoComplete="organization"
          required
          defaultValue={defaultBusinessName}
          placeholder="Your business or brand"
          aria-invalid={Boolean(state.fieldErrors?.business_name)}
          className={fieldClass}
        />
        {state.fieldErrors?.business_name ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.business_name}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label className="text-white">Email</Label>
        <Input
          type="email"
          value={email ?? ""}
          disabled
          readOnly
          className={`${fieldClass} opacity-70`}
        />
        <p className="text-muted-foreground text-xs">
          Linked to your account — contact us to change it.
        </p>
      </div>

      <SubmitButton
        pendingText="Saving…"
        className="h-11 w-full rounded-xl bg-white text-neutral-900 hover:bg-white/90"
      >
        Continue
      </SubmitButton>
    </form>
  );
}

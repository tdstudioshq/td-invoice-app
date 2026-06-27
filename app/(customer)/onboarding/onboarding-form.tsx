"use client";

import { useActionState } from "react";

import { completeOnboardingAction } from "@/app/actions/profile";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]";

export function OnboardingForm({ email }: { email: string | null }) {
  const [state, formAction] = useActionState(
    completeOnboardingAction,
    initialActionState,
  );

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
        <Label htmlFor="full_name" className="text-white">
          Full name
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
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

      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-white">
          Phone number
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          placeholder="(555) 555-5555"
          aria-invalid={Boolean(state.fieldErrors?.phone)}
          className={fieldClass}
        />
        {state.fieldErrors?.phone ? (
          <p className="text-destructive text-xs">{state.fieldErrors.phone}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="instagram" className="text-white">
          Instagram username
        </Label>
        <Input
          id="instagram"
          name="instagram"
          type="text"
          required
          placeholder="@yourhandle"
          aria-invalid={Boolean(state.fieldErrors?.instagram)}
          className={fieldClass}
        />
        {state.fieldErrors?.instagram ? (
          <p className="text-destructive text-xs">
            {state.fieldErrors.instagram}
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

      <SubmitButton
        pendingText="Saving…"
        className="h-11 w-full rounded-xl bg-white text-neutral-900 hover:bg-white/90"
      >
        Complete setup
      </SubmitButton>
    </form>
  );
}

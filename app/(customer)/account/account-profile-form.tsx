"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateProfileAction } from "@/app/actions/profile";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fieldClass =
  "h-11 rounded-xl border-white/15 bg-white/[0.05] px-3.5 dark:bg-white/[0.05]";

export interface ProfileDefaults {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  businessName: string | null;
}

export function AccountProfileForm({ profile }: { profile: ProfileDefaults }) {
  const [state, formAction] = useActionState(
    updateProfileAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.success) toast.success("Profile updated.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
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
            defaultValue={profile.fullName ?? ""}
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
            value={profile.email ?? ""}
            disabled
            readOnly
            className={`${fieldClass} opacity-70`}
          />
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
            defaultValue={profile.phone ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.phone)}
            className={fieldClass}
          />
          {state.fieldErrors?.phone ? (
            <p className="text-destructive text-xs">
              {state.fieldErrors.phone}
            </p>
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
            defaultValue={profile.instagram ?? ""}
            aria-invalid={Boolean(state.fieldErrors?.instagram)}
            className={fieldClass}
          />
          {state.fieldErrors?.instagram ? (
            <p className="text-destructive text-xs">
              {state.fieldErrors.instagram}
            </p>
          ) : null}
        </div>
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
          defaultValue={profile.businessName ?? ""}
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
        className="h-11 w-full rounded-xl bg-white text-neutral-900 hover:bg-white/90 sm:w-auto sm:self-end sm:px-6"
      >
        Save changes
      </SubmitButton>
    </form>
  );
}

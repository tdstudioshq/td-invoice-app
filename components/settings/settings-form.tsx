"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateSettingsAction } from "@/app/actions/settings";
import { initialActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompanySettings } from "@/lib/types/database";

export function SettingsForm({
  settings,
}: {
  settings: CompanySettings | null;
}) {
  const [state, formAction] = useActionState(
    updateSettingsAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.success) toast.success("Settings saved");
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={settings?.id ?? ""} />
      <Card>
        <CardContent className="space-y-5 pt-6">
          {state.error ? (
            <p className="bg-destructive/10 text-destructive border-destructive/30 border px-3 py-2 text-sm">
              {state.error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="company_name">
              Company name<span className="text-destructive"> *</span>
            </Label>
            <Input
              id="company_name"
              name="company_name"
              defaultValue={settings?.company_name ?? "TD Studios"}
              aria-invalid={Boolean(state.fieldErrors?.company_name)}
            />
            {state.fieldErrors?.company_name ? (
              <p className="text-destructive text-xs">
                {state.fieldErrors.company_name}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={settings?.email ?? ""}
                aria-invalid={Boolean(state.fieldErrors?.email)}
              />
              {state.fieldErrors?.email ? (
                <p className="text-destructive text-xs">
                  {state.fieldErrors.email}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={settings?.phone ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={settings?.address ?? ""}
              rows={2}
            />
          </div>

          <div className="space-y-2 sm:max-w-40">
            <Label htmlFor="tax_rate">Default tax rate %</Label>
            <Input
              id="tax_rate"
              name="tax_rate"
              type="number"
              min="0"
              max="100"
              step="0.001"
              defaultValue={String(settings?.tax_rate ?? 0)}
              aria-invalid={Boolean(state.fieldErrors?.tax_rate)}
            />
            {state.fieldErrors?.tax_rate ? (
              <p className="text-destructive text-xs">
                {state.fieldErrors.tax_rate}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_instructions">Payment instructions</Label>
            <Textarea
              id="payment_instructions"
              name="payment_instructions"
              defaultValue={settings?.payment_instructions ?? ""}
              placeholder="Bank transfer details, accepted methods, terms…"
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </form>
  );
}

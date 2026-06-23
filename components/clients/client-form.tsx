"use client";

import Link from "next/link";
import { useActionState } from "react";

import { initialActionState, type ActionState } from "@/app/actions/types";
import { SubmitButton } from "@/components/shared/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Client } from "@/lib/types/database";

type FormAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;

export function ClientForm({
  action,
  client,
  submitLabel = "Save client",
  cancelHref = "/clients",
}: {
  action: FormAction;
  client?: Client | null;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="space-y-5 pt-6">
          {state.error ? (
            <p className="bg-destructive/10 text-destructive border-destructive/30 border px-3 py-2 text-sm">
              {state.error}
            </p>
          ) : null}

          <Field
            label="Company name"
            name="company_name"
            required
            defaultValue={client?.company_name}
            error={state.fieldErrors?.company_name}
            placeholder="Acme Inc."
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Contact name"
              name="contact_name"
              defaultValue={client?.contact_name ?? ""}
              error={state.fieldErrors?.contact_name}
              placeholder="Jane Doe"
            />
            <Field
              label="Email"
              name="email"
              type="email"
              defaultValue={client?.email ?? ""}
              error={state.fieldErrors?.email}
              placeholder="jane@acme.com"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Phone"
              name="phone"
              defaultValue={client?.phone ?? ""}
              error={state.fieldErrors?.phone}
              placeholder="+1 555 000 1234"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              name="address"
              defaultValue={client?.address ?? ""}
              placeholder="123 Studio Way, New York, NY"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={client?.notes ?? ""}
              placeholder="Anything worth remembering about this client…"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  required,
  type = "text",
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

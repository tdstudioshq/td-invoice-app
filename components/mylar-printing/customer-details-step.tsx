"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  StepHeading,
  fieldClass,
  helpTextClass,
} from "@/components/mylar-printing/wizard-ui";
import {
  brandNameSchema,
  contactPhoneError,
  customerEmailSchema,
  customerNameSchema,
  customerPhoneSchema,
  firstError,
  neededBySchema,
  notesSchema,
} from "@/lib/mylar-printing/schema";
import {
  CONTACT_METHODS,
  requiresPhone,
  type MylarContactMethod,
} from "@/lib/mylar-printing/types";
import { cn } from "@/lib/utils";

/**
 * Step 5 — contact details, the lead fields, and free-form notes.
 *
 * Plain controlled inputs validated against the SAME zod field schemas the
 * server action parses, rather than react-hook-form: RHF is in package.json but
 * unused anywhere in this codebase (every other form here is either a Server
 * Action with `useActionState` or controlled state), and a five-step wizard
 * holding one draft object is simpler with one state owner than with a form
 * instance per step. Client validation is UX only — the server re-runs it.
 *
 * Errors appear on blur, or immediately once a submit has been attempted, so
 * nobody is scolded for a field they haven't finished typing.
 *
 * FIELD BUDGET. Everything here earns its place by changing how the studio
 * opens the conversation. Brand names the job, contact method says which
 * channel to use, and a deadline reframes the whole call — that is why those
 * three exist and why nothing else was added alongside them. Only contact
 * method is required, and only because a preference nobody expressed is worth
 * nothing.
 */
export function CustomerDetailsStep({
  name,
  email,
  phone,
  brandName,
  contactMethod,
  neededBy,
  notes,
  honeypot,
  showAllErrors,
  serverFieldErrors,
  onChange,
  onHoneypotChange,
}: {
  name: string;
  email: string;
  phone: string;
  brandName: string;
  contactMethod: MylarContactMethod | undefined;
  neededBy: string;
  notes: string;
  honeypot: string;
  showAllErrors: boolean;
  serverFieldErrors: Record<string, string>;
  onChange: (patch: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    brandName?: string;
    contactMethod?: MylarContactMethod;
    neededBy?: string;
    notes?: string;
  }) => void;
  onHoneypotChange: (value: string) => void;
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (field: string) =>
    setTouched((current) => ({ ...current, [field]: true }));

  const errorFor = (field: string, message: string | null) => {
    if (serverFieldErrors[field]) return serverFieldErrors[field];
    if (!message) return null;
    return showAllErrors || touched[field] ? message : null;
  };

  const nameError = errorFor("customerName", firstError(customerNameSchema, name));
  const emailError = errorFor(
    "customerEmail",
    firstError(customerEmailSchema, email),
  );
  // The cross-field rule wins: "add a number we can text" is more use than
  // "enter a valid phone number" when the field is simply empty.
  const phoneError = errorFor(
    "customerPhone",
    contactPhoneError(contactMethod, phone) ??
      firstError(customerPhoneSchema, phone),
  );
  const brandError = errorFor("brandName", firstError(brandNameSchema, brandName));
  const neededByError = errorFor("neededBy", firstError(neededBySchema, neededBy));
  const notesError = errorFor("notes", firstError(notesSchema, notes));
  // Only ever shown after a submit attempt: the group starts unanswered by
  // design, and flagging it on arrival would scold somebody for a question they
  // have not reached yet.
  const contactMethodError =
    serverFieldErrors.contactMethod ??
    (showAllErrors && !contactMethod
      ? "Tell us how you'd like to be contacted."
      : null);

  const phoneRequired = requiresPhone(contactMethod);

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title="Almost done."
        subtitle="Add your contact information and anything else we should know."
      />

      {/*
        Honeypot. Hidden from sight, from screen readers, and from the tab
        order — a person cannot fill it in, so any value means a bot. Not
        `display:none`, which some bots skip; kept in the layout but pushed
        off-screen. The server decides what to do with it.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] opacity-0">
        <label htmlFor="mylar-website">Website</label>
        <input
          id="mylar-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(event) => onHoneypotChange(event.target.value)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="customerName" className="text-white">
            Name
          </Label>
          <Input
            id="customerName"
            name="customerName"
            autoComplete="name"
            placeholder="Your full name"
            value={name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "customerName-error" : undefined}
            onChange={(event) => onChange({ customerName: event.target.value })}
            onBlur={() => touch("customerName")}
            className={cn("h-12", fieldClass)}
          />
          {nameError ? (
            <p id="customerName-error" role="alert" className="text-sm leading-relaxed text-red-300">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brandName" className="text-white">
            Brand or company{" "}
            <span className="text-muted-foreground text-[13px] md:text-[11px]">
              (optional)
            </span>
          </Label>
          <Input
            id="brandName"
            name="brandName"
            autoComplete="organization"
            placeholder="The name on the bags"
            value={brandName}
            aria-invalid={brandError ? true : undefined}
            aria-describedby={brandError ? "brandName-error" : undefined}
            onChange={(event) => onChange({ brandName: event.target.value })}
            onBlur={() => touch("brandName")}
            className={cn("h-12", fieldClass)}
          />
          {brandError ? (
            <p id="brandName-error" role="alert" className="text-sm leading-relaxed text-red-300">
              {brandError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="customerEmail" className="text-white">
            Email
          </Label>
          <Input
            id="customerEmail"
            name="customerEmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "customerEmail-error" : undefined}
            onChange={(event) => onChange({ customerEmail: event.target.value })}
            onBlur={() => touch("customerEmail")}
            className={cn("h-12", fieldClass)}
          />
          {emailError ? (
            <p id="customerEmail-error" role="alert" className="text-sm leading-relaxed text-red-300">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="customerPhone" className="text-white">
            Phone number{" "}
            <span className="text-muted-foreground text-[13px] md:text-[11px]">
              {phoneRequired ? "(required)" : "(optional)"}
            </span>
          </Label>
          <Input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 555-5555"
            value={phone}
            aria-required={phoneRequired || undefined}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? "customerPhone-error" : undefined}
            onChange={(event) => onChange({ customerPhone: event.target.value })}
            onBlur={() => touch("customerPhone")}
            className={cn("h-12", fieldClass)}
          />
          {phoneError ? (
            <p id="customerPhone-error" role="alert" className="text-sm leading-relaxed text-red-300">
              {phoneError}
            </p>
          ) : null}
        </div>
      </div>

      {/*
        Contact preference. A real radiogroup rather than three buttons, so
        arrow keys move within it and the whole set is one tab stop — same
        pattern as OptionCard on the earlier steps, at a size that suits three
        one-word choices.

        Selecting Text or Call marks the phone field required above; that is the
        only thing this answer changes in the app. Nothing is sent to anybody.
      */}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-base leading-none font-medium text-white md:mb-0 md:text-sm">
          How should we reach you?
        </legend>
        <div
          className="grid grid-cols-3 gap-2.5"
          role="radiogroup"
          aria-label="Preferred contact method"
          aria-invalid={contactMethodError ? true : undefined}
          aria-describedby={
            contactMethodError ? "contactMethod-error" : "contactMethod-hint"
          }
        >
          {CONTACT_METHODS.map((option) => {
            const checked = contactMethod === option.id;
            return (
              <label
                key={option.id}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 py-3 text-base transition-all active:translate-y-px md:min-h-0 md:text-sm",
                  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70",
                  checked
                    ? "border-white/45 bg-white/[0.14] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
                    : "border-white/15 bg-black/40 text-white/80 hover:border-white/30 hover:bg-black/25",
                )}
              >
                <input
                  type="radio"
                  name="contactMethod"
                  value={option.id}
                  checked={checked}
                  onChange={() => onChange({ contactMethod: option.id })}
                  className="sr-only"
                />
                {option.label}
              </label>
            );
          })}
        </div>
        {contactMethodError ? (
          <p id="contactMethod-error" role="alert" className="text-sm leading-relaxed text-red-300">
            {contactMethodError}
          </p>
        ) : (
          <p id="contactMethod-hint" className={helpTextClass}>
            {contactMethod
              ? CONTACT_METHODS.find((o) => o.id === contactMethod)?.detail
              : "We'll use this to get back to you about your quote."}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="neededBy" className="text-white">
          Need it by{" "}
          <span className="text-muted-foreground text-[13px] md:text-[11px]">
              (optional)
            </span>
        </Label>
        {/*
          Native date input: it gives every platform its own familiar picker,
          types nothing on mobile, and hands back the `YYYY-MM-DD` the column
          stores. `min` is today as a nudge only — a past date is NOT rejected
          server-side, because a customer a day behind UTC should never lose a
          lead over a date field nothing schedules from.
        */}
        <Input
          id="neededBy"
          name="neededBy"
          type="date"
          min={new Date().toISOString().slice(0, 10)}
          value={neededBy}
          aria-invalid={neededByError ? true : undefined}
          aria-describedby={neededByError ? "neededBy-error" : "neededBy-hint"}
          onChange={(event) => onChange({ neededBy: event.target.value })}
          onBlur={() => touch("neededBy")}
          className={cn("h-12 w-full sm:max-w-64", fieldClass)}
        />
        {neededByError ? (
          <p id="neededBy-error" role="alert" className="text-sm leading-relaxed text-red-300">
            {neededByError}
          </p>
        ) : (
          <p id="neededBy-hint" className={helpTextClass}>
            If you&apos;re working to a deadline, tell us and we&apos;ll say
            what&apos;s doable.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes" className="text-white">
          Additional notes{" "}
          <span className="text-muted-foreground text-[13px] md:text-[11px]">
              (optional)
            </span>
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={5}
          placeholder="Tell us anything else we should know about your order, artwork, sizing, printing, or special instructions."
          value={notes}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? "notes-error" : undefined}
          onChange={(event) => onChange({ notes: event.target.value })}
          onBlur={() => touch("notes")}
          className={cn("min-h-36 py-3 md:min-h-32 md:py-2.5", fieldClass)}
        />
        {notesError ? (
          <p id="notes-error" role="alert" className="text-sm leading-relaxed text-red-300">
            {notesError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

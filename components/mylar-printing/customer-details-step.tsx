"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StepHeading, fieldClass } from "@/components/mylar-printing/wizard-ui";
import {
  customerEmailSchema,
  customerNameSchema,
  customerPhoneSchema,
  firstError,
  notesSchema,
} from "@/lib/mylar-printing/schema";
import { cn } from "@/lib/utils";

/**
 * Step 5 — contact details and free-form notes.
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
 */
export function CustomerDetailsStep({
  name,
  email,
  phone,
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
  notes: string;
  honeypot: string;
  showAllErrors: boolean;
  serverFieldErrors: Record<string, string>;
  onChange: (patch: {
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
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
  const phoneError = errorFor(
    "customerPhone",
    firstError(customerPhoneSchema, phone),
  );
  const notesError = errorFor("notes", firstError(notesSchema, notes));

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

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
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
            <p id="customerName-error" role="alert" className="text-sm text-red-300">
              {nameError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
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
            <p id="customerEmail-error" role="alert" className="text-sm text-red-300">
              {emailError}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="customerPhone" className="text-white">
            Phone number{" "}
            <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Input
            id="customerPhone"
            name="customerPhone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 555-5555"
            value={phone}
            aria-invalid={phoneError ? true : undefined}
            aria-describedby={phoneError ? "customerPhone-error" : undefined}
            onChange={(event) => onChange({ customerPhone: event.target.value })}
            onBlur={() => touch("customerPhone")}
            className={cn("h-12", fieldClass)}
          />
          {phoneError ? (
            <p id="customerPhone-error" role="alert" className="text-sm text-red-300">
              {phoneError}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes" className="text-white">
          Additional notes{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
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
          className={cn("min-h-32 py-2.5", fieldClass)}
        />
        {notesError ? (
          <p id="notes-error" role="alert" className="text-sm text-red-300">
            {notesError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

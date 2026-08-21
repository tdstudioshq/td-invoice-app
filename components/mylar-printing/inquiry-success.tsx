"use client";

import Link from "next/link";
import { CheckCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { InquirySummary } from "@/components/mylar-printing/inquiry-summary";
import { primaryButtonClass } from "@/components/mylar-printing/wizard-ui";
import type { MylarPrintingDraft } from "@/lib/mylar-printing/types";

/**
 * Confirmation screen — replaces the wizard once the inquiry is stored.
 *
 * The reference number shown here is the random MYL-XXXXXX handle, never the
 * row's uuid or any sequential id, so it can be quoted over text or the phone
 * without leaking how many requests have come in. The recap is read-only (no
 * Edit affordances): the request is filed, and changes go through us.
 */
export function InquirySuccess({
  referenceNumber,
  draft,
}: {
  referenceNumber: string;
  draft: MylarPrintingDraft;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircleIcon weight="fill" className="size-12 text-emerald-400" />
        <div className="space-y-2">
          <h2 className="text-2xl leading-tight text-white">
            Printing Request Received
          </h2>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">
            We received your custom Mylar printing request. TD Studios will
            review your order details and artwork and contact you with the next
            steps.
          </p>
        </div>

        <div className="rounded-xl border border-white/15 bg-black/35 px-5 py-3">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
            Reference
          </p>
          <p className="mt-0.5 font-mono text-xl tracking-widest text-white">
            {referenceNumber}
          </p>
        </div>
      </div>

      <InquirySummary draft={draft} />

      <Button asChild className={primaryButtonClass}>
        <Link href="/">Back to TD Studios</Link>
      </Button>
    </div>
  );
}

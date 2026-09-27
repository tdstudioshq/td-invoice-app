"use client";

import Link from "next/link";
import { ChatCircleTextIcon, CheckCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { InquirySummary } from "@/components/mylar-printing/inquiry-summary";
import { primaryButtonClass } from "@/components/mylar-printing/wizard-ui";
import type { MylarPrintingDraft } from "@/lib/mylar-printing/types";

/** The same number as the page's CLICK TO TEXT button. */
const TEXT_NUMBER = "+19297528373";

/**
 * An sms: link with the reference prefilled. `?&body=` is the one spelling
 * that both iOS (which wants `&body=`) and Android (which wants `?body=`)
 * accept. Same tab, like every other sms: handoff here — the OS takes the
 * navigation, so `target="_blank"` would strand an empty tab.
 */
function textHref(referenceNumber: string) {
  const body = `Hi TD Studios, I just submitted a custom Mylar printing request. My reference number is ${referenceNumber}.`;
  return `sms:${TEXT_NUMBER}?&body=${encodeURIComponent(body)}`;
}

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
        <CheckCircleIcon weight="fill" className="size-14 text-emerald-400 md:size-12" />
        <div className="space-y-2">
          <h2 className="text-3xl leading-tight text-white md:text-2xl">
            Printing Request Received
          </h2>
          <p className="text-muted-foreground mx-auto max-w-md text-base leading-relaxed md:text-sm">
            We received your custom Mylar printing request. TD Studios will
            review your order details and artwork and contact you with the next
            steps.
          </p>
        </div>

        <div className="rounded-xl border border-white/15 bg-black/35 px-5 py-3.5">
          <p className="text-muted-foreground text-xs tracking-[0.18em] uppercase md:text-[11px]">
            Reference
          </p>
          <p className="mt-1 font-mono text-2xl tracking-widest text-white md:text-xl">
            {referenceNumber}
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="h-12 gap-2 border-white/15 bg-black/35 px-6 text-base text-white hover:bg-black/25 md:h-11 md:px-6 md:text-sm"
        >
          <a href={textHref(referenceNumber)}>
            <ChatCircleTextIcon weight="bold" className="size-5 shrink-0 md:size-4" />
            Send a text
          </a>
        </Button>
      </div>

      <InquirySummary draft={draft} />

      <Button asChild className={primaryButtonClass}>
        <Link href="/">Back to TD Studios</Link>
      </Button>
    </div>
  );
}

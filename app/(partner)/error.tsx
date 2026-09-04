"use client";

import { useEffect } from "react";
import { ArrowClockwiseIcon, WarningIcon } from "@phosphor-icons/react";

import { reportError } from "@/lib/observability/report-error";

/**
 * Catches render failures anywhere in a print-partner portal.
 *
 * DELIBERATELY OFFERS NO NAVIGATION LINK. Every other boundary can hardcode a
 * home ("/dashboard", "/portal", "/"), but this group is reached by three
 * different addresses — zazaorders.tdstudiosny.com/jobs, /zaza-orders/jobs and
 * /partner/zaza/jobs — and the prefix that makes a link correct comes from
 * partnerBasePath(), which reads a request header the proxy sets. An error.tsx
 * is a Client Component with no access to that, so any href written here would
 * be right on one address and broken on the other two. Retry and reload both
 * stay on whichever host the rep actually used.
 */
export default function PartnerError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError("partner-route", error);
  }, [error]);

  return (
    <main className="public-page on-glass flex min-h-svh flex-col items-center justify-center text-center">
      <div className="flex size-10 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/10 text-amber-300">
        <WarningIcon weight="bold" className="size-5" />
      </div>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        We couldn&apos;t load that page. Your jobs are safe — nothing was
        changed. Try again, and text TD Studios if it keeps happening.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25"
      >
        <ArrowClockwiseIcon weight="bold" className="size-4" />
        Try again
      </button>
      {error.digest ? (
        <p className="text-muted-foreground/70 mt-4 font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react";

import { reportError } from "@/lib/observability/report-error";

// Matches the glass action buttons on /account/pending — this boundary renders
// INSIDE (customer)/layout.tsx, which already supplies the animated backdrop
// and the max-w-2xl column, so only the panel itself belongs here.
const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/35 px-4 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25";

/**
 * Catches render failures under /onboarding and /account/*.
 *
 * Worth its own boundary rather than falling through to global-error: a
 * customer here is signed in but NOT yet approved, so the useful escape hatch
 * is "home", not "dashboard" or "portal" — both of which would bounce them
 * straight back through roleHome(). A throw from the group layout's
 * requireCustomer() still goes to global-error, as in every other group.
 */
export default function CustomerError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError("customer-route", error);
  }, [error]);

  return (
    <div className="text-on-photo flex flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-white">
        Something went wrong
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        We couldn&apos;t load your account just now. This is usually temporary —
        try again in a moment.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" onClick={() => retry()} className={actionClass}>
          <ArrowClockwiseIcon weight="bold" className="size-4" />
          Try again
        </button>
        <Link href="/" className={actionClass}>
          <HouseIcon weight="bold" className="size-4" />
          Return home
        </Link>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground/70 font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";

import { HomeLogoLink } from "@/components/layout/home-logo";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/observability/report-error";

/**
 * The catch-all boundary for every route that is not inside a route group.
 *
 * ONE FILE RATHER THAN ONE PER PUBLIC ROUTE. The four data-backed groups each
 * own a boundary already, so what falls through to here is the public surface —
 * the sign-in card, /login, /sign-up, /reset-password, /q/<slug>, the galleries
 * and the print tools. Errors bubble to the NEAREST boundary, so this single
 * file covers all of them; adding an error.tsx per public folder would be a
 * dozen copies with nothing different in them.
 *
 * Most public pages degrade rather than throw — the gallery reads return [] on
 * a Storage failure by design — so this is genuinely the unexpected case, and
 * it deliberately keeps its escape hatch to "/" rather than assuming a role.
 */
export default function PublicError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError("public-route", error);
  }, [error]);

  return (
    <div className="public-page flex min-h-svh flex-col items-center justify-center text-center">
      <div className="mb-8">
        <HomeLogoLink />
      </div>
      <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase md:text-xs">
        Error
      </p>
      <h1 className="public-title mt-2 font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-base leading-relaxed md:text-sm">
        This page didn&apos;t load. It&apos;s usually temporary — try again, or
        head back home.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground/70 mt-4 font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}

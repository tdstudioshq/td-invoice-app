"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/observability/report-error";

/**
 * Catches render failures under /portal/*.
 *
 * As in the (app) group, a throw from (portal)/layout.tsx — which runs
 * requirePortalUser() — lands on app/global-error.tsx instead, not here.
 */
export default function PortalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError("portal-route", error);
  }, [error]);

  return (
    <div className="border-border flex flex-col items-center justify-center border border-dashed px-6 py-20 text-center">
      <div className="bg-destructive/10 text-destructive mb-4 flex size-10 items-center justify-center">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        We couldn&apos;t load this page. Try again, or return to your portal.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/portal">Back to portal</Link>
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

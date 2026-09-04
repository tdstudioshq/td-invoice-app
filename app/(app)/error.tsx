"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/observability/report-error";

/**
 * Catches render failures anywhere under /dashboard, /invoices, /clients, …
 *
 * It does NOT catch a throw from (app)/layout.tsx itself — an error.tsx never
 * wraps the layout in its own segment — and that layout calls requireAdmin().
 * app/global-error.tsx is the boundary for that case.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // `retry()` re-fetches and re-renders the segment; `reset()` only clears the
  // error state, which for a failed Supabase read just re-renders the failure.
  retry: () => void;
}) {
  useEffect(() => {
    reportError("app-route", error);
  }, [error]);

  return (
    <div className="border-border flex flex-col items-center justify-center border border-dashed px-6 py-20 text-center">
      <div className="bg-destructive/10 text-destructive mb-4 flex size-10 items-center justify-center">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        An unexpected error occurred while loading this page. You can try again
        or head back to the dashboard.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
      {/* The digest is the only identifier safe to show: it is a hash Next
          generates so this screen can be matched to a server log line. */}
      {error.digest ? (
        <p className="text-muted-foreground/70 mt-4 font-mono text-xs">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}

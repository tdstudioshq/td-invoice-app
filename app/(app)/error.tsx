"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(observability): report to an error monitoring service.
    console.error(error);
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
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

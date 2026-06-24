import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <div className="mb-8">
        <Brand />
      </div>
      <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
        404
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        The page you’re looking for doesn’t exist or may have been moved.
      </p>
      <div className="mt-6 flex items-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}

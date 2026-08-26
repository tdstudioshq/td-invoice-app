import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="public-page flex min-h-svh flex-col items-center justify-center text-center">
      <div className="mb-8">
        <Brand />
      </div>
      <p className="text-muted-foreground text-sm tracking-[0.2em] uppercase md:text-xs">
        404
      </p>
      <h1 className="public-title mt-2 font-semibold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-base leading-relaxed md:text-sm">
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

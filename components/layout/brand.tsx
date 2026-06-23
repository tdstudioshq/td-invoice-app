import Link from "next/link";

import { cn } from "@/lib/utils";

/** TD Studios wordmark used in the sidebar and mobile header. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn("flex items-center gap-2.5 select-none", className)}
    >
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center text-sm font-bold tracking-tight">
        TD
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight">
          TD Studios
        </span>
        <span className="text-muted-foreground text-[10px] tracking-[0.18em] uppercase">
          Invoicing
        </span>
      </span>
    </Link>
  );
}

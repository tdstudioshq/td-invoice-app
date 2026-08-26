import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** TD Studios wordmark used in the sidebar and mobile header. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={cn("flex items-center gap-2.5 select-none", className)}
    >
      <Image
        src="/logo.png"
        alt="TD Studios — TNT Printing, New York City"
        width={36}
        height={36}
        className="size-9 shrink-0"
      />
      <span className="flex flex-col leading-none">
        <span className="text-base font-semibold tracking-tight md:text-sm">
          TD Studios
        </span>
        <span className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase md:text-[10px]">
          Invoicing
        </span>
      </span>
    </Link>
  );
}

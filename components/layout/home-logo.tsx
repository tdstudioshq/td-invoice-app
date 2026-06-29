import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The circular TD Studios logo used as the header brand mark on public and
 * standalone pages. Clicking it returns to the home page (`/`); the proxy then
 * routes any authenticated visitor on to their role home. The admin and portal
 * shells use their own brand marks (`Brand`, `PortalBrand`) linking to their
 * respective dashboards instead.
 */
export function HomeLogoLink({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="TD Studios home"
      className={cn(
        "rounded-full transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="TD Studios"
        width={56}
        height={56}
        priority
        className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
      />
    </Link>
  );
}

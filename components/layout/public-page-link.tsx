import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

/**
 * The footer link that closes every public page.
 *
 * It existed as the same eight lines of JSX in fifteen files, all of them
 * `text-xs` with no padding — 12px of Bebas with a ~12px hit box, at the very
 * bottom of the page where iOS Safari's toolbar overlaps. One component instead:
 *
 *  - 14px on a phone, back to 12px from `md` up so the desktop footer is
 *    unchanged;
 *  - `min-h-11` plus horizontal padding, so the target is a real 44px pill
 *    rather than the height of the glyphs;
 *  - `-mx-2` cancels that padding for layout, so nothing around it shifts.
 *
 * `label`/`href` are props because two pages point somewhere other than home
 * (the tool cross-links), and those are the same control with a different
 * destination — not a second component.
 */
export function PublicPageLink({
  href,
  children,
  showArrow = true,
  className,
}: {
  href: string;
  children: React.ReactNode;
  showArrow?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-on-photo text-muted-foreground hover:text-foreground -mx-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none md:text-xs",
        className,
      )}
    >
      {showArrow ? (
        <ArrowLeftIcon weight="bold" className="size-4 shrink-0 md:size-3.5" />
      ) : null}
      {children}
    </Link>
  );
}

/** The overwhelmingly common case: "← Back to TD Studios". */
export function BackToStudiosLink({ className }: { className?: string }) {
  return (
    <PublicPageLink href="/" className={className}>
      Back to TD Studios
    </PublicPageLink>
  );
}

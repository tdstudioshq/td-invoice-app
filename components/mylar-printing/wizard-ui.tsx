"use client";

import Image from "next/image";
import { CheckIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";

/**
 * Presentational primitives shared by every step of the mylar printing wizard.
 *
 * The visual language is the site's existing dark-glass public-page treatment
 * (see /custom-design-request and /mylar-bag-printing): white-alpha borders on
 * a blurred translucent panel, inset top highlight, white primary button.
 * The field class is redeclared here rather than imported from
 * lib/design-request-upload.ts on purpose — that module pulls in the Formspree
 * design-request server actions, which have nothing to do with this wizard and
 * shouldn't be referenced from its bundle.
 */

export const fieldClass =
  "rounded-xl border-white/15 bg-white/[0.05] px-3.5 text-white placeholder:text-white/40 dark:bg-white/[0.05]";

export const primaryButtonClass =
  "h-12 w-full gap-2 bg-white text-neutral-900 hover:bg-white/90 disabled:opacity-40";

export const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md";

/** Question + one-line explainer at the top of each step. */
export function StepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-xl leading-tight text-white sm:text-2xl">{title}</h2>
      <p className="text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
}

/**
 * One selectable card in a single-select group.
 *
 * Built on a visually-hidden `<input type="radio">` wrapped in a `<label>`
 * rather than a styled `<button>`: that gives native keyboard semantics for
 * free (arrow keys move within the group, Space selects, the group is one tab
 * stop) and makes the whole card clickable, which a role="radio" button would
 * only imitate. Focus is drawn from the hidden input via `peer-focus-visible`.
 */
export function OptionCard({
  name,
  value,
  checked,
  onSelect,
  title,
  meta,
  detail,
  visual,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  meta?: string | null;
  detail?: string;
  visual?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-all active:translate-y-px",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-transparent",
        checked
          ? "border-white/45 bg-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
          : "border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.09]",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      {visual ? <span className="shrink-0">{visual}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base leading-tight text-white">{title}</span>
        {meta ? (
          <span className="text-sm leading-tight text-white/70">{meta}</span>
        ) : null}
        {detail ? (
          <span className="text-muted-foreground text-xs leading-snug">
            {detail}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked ? "border-white bg-white text-neutral-900" : "border-white/25",
        )}
      >
        {checked ? <CheckIcon weight="bold" className="size-3.5" /> : null}
      </span>
    </label>
  );
}

/**
 * Preview thumbnail on a bag-type card.
 *
 * A fixed SQUARE box with the artwork `object-contain`ed inside it, rather than
 * a box shaped to each bag: the four styles are portrait, landscape, and
 * oversized, so a per-bag box would make the grid ragged, while cropping a
 * mockup to fill a shared box would cut the artwork. Contain keeps every bag
 * whole and the grid even; the letterboxing itself reads as the bag's shape
 * once the real per-style mockups replace the shared placeholder.
 *
 * The thumbnail deliberately does NOT grow at `sm`. That is where the option
 * grid switches to two columns, which makes each card its NARROWEST (~265px)
 * — growing the image there squeezes the title into two lines. It scales at
 * `md`/`lg` instead, where the cards are actually wide enough to afford it.
 *
 * `alt` is intentionally empty — the card's own title names the bag, so giving
 * the image a label would make a screen reader announce it twice.
 */
export function BagPreview({ src }: { src: string }) {
  return (
    <span className="relative block size-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.05] md:size-20 lg:size-24">
      {/* `unoptimized`: these sources are already stored at exactly the size
          they render (192px = 2x the 96px max), so running them through the
          image optimizer would buy nothing — and this project's Vercel image
          optimization allowance is exhausted, which makes every uncached
          transform return 402 and the thumbnail render blank. Serving the
          static file directly is both smaller end-to-end and immune to that. */}
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        sizes="(min-width: 1024px) 96px, (min-width: 768px) 80px, 64px"
        className="object-contain p-1"
      />
    </span>
  );
}

/** Inline field-level error, styled to match the app's destructive treatment. */
export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="text-sm text-red-300" role="alert">
      {children}
    </p>
  );
}

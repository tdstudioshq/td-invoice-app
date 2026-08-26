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

/**
 * `text-base` is restated here on purpose even though `Input` already sets it:
 * these fields are composed as `cn("h-12", fieldClass)`, and any future caller
 * that passes a size would otherwise silently drop below the 16px iOS Safari
 * needs to not zoom the viewport on focus. `md:text-sm` keeps desktop close to
 * the compact `md:text-xs` the primitive uses without going under it.
 */
export const fieldClass =
  "rounded-xl border-white/15 bg-black/35 px-3.5 text-base text-white placeholder:text-white/60 md:text-sm dark:bg-black/35";

export const primaryButtonClass =
  "h-13 w-full gap-2 text-base bg-white text-neutral-900 hover:bg-white/90 disabled:opacity-60 md:h-12 md:text-[15px]";

export const panelClass =
  "rounded-2xl border border-white/10 bg-black/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] backdrop-blur-md";

/**
 * The wizard's own two secondary type roles, so the pair stays in step across
 * five steps and the summary rather than being re-typed at each call site.
 *
 * Both follow the house pattern the shadcn primitives here already use — a
 * comfortable phone size stepping down to the compact desktop one at `md` —
 * which is what lets the phone gain ~2px per role without the desktop panel
 * changing at all.
 */
export const helpTextClass = "text-muted-foreground text-sm leading-relaxed md:text-xs";

export const metaLabelClass =
  "text-muted-foreground text-xs tracking-[0.16em] uppercase md:text-[11px]";

/**
 * Question + one-line explainer at the top of each step, plus an optional
 * spec note.
 *
 * `note` exists because step 1's subtitle was carrying two unrelated
 * sentences — an instruction and a material spec — concatenated with no
 * separator ("…you want us to print.HIGH QUALITY - 6 MIL…"). They are
 * different KINDS of statement, so they get different treatments rather than
 * a space between them: prose stays prose, and the spec becomes a bordered
 * chip that reads as a stamped fact about the product.
 */
export function StepHeading({
  title,
  subtitle,
  note,
}: {
  title: string;
  subtitle: string;
  note?: string;
}) {
  return (
    /*
     * `gap-2` rather than `space-y-1.5`: the question and its explainer were
     * running together on a phone, which is what made the step read as a wall
     * of text. Bebas has no descenders to separate the two lines optically, so
     * the separation has to come from the box.
     */
    <div className="flex flex-col gap-2">
      {/* 24px on a phone — up from 20px, and now matching the desktop size
          instead of sitting a step under it. */}
      <h2 className="text-2xl leading-tight text-white">{title}</h2>
      <p className="text-muted-foreground text-base leading-relaxed md:text-sm">
        {subtitle}
      </p>
      {note ? (
        <span className="mt-0.5 inline-flex w-fit items-center rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs leading-none tracking-[0.14em] text-white/80 uppercase md:text-[11px]">
          {note}
        </span>
      ) : null}
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
        /*
         * `min-h-16` is the floor, not the height: a card with only a title
         * (the design-count step) collapsed to ~52px, which is under the 44px
         * target once its padding is discounted. Cards that carry a thumbnail
         * are taller than this anyway, so nothing grows that did not need to.
         */
        "group relative flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition-all active:translate-y-px xs:gap-3.5 xs:p-4 sm:gap-4",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-white/70 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-transparent",
        checked
          ? "border-white/45 bg-white/[0.14] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)]"
          : "border-white/15 bg-black/40 hover:border-white/30 hover:bg-black/25",
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
      {/*
        Three ranks, told apart by size, colour and tracking rather than by
        adding rules or padding — the card must stay compact enough that four
        of them fit a phone screen.

          1. NAME       18px white, the only line at full weight of attention
          2. DIMENSIONS 13px tracked caps, tabular — reads as a spec, not prose,
                        so the eye skips it when scanning names and finds it
                        immediately when comparing sizes
          3. DESCRIPTION 14px muted, `leading-snug`. Bebas has no descenders,
                        so the usual `leading-relaxed` opens a gap that reads as
                        a paragraph break — and three loose lines is exactly
                        what made these cards tall
      */}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-lg leading-tight text-white md:text-base">
          {title}
        </span>
        {meta ? (
          <span className="text-[13px] leading-tight tracking-[0.08em] text-white/65 tabular-nums uppercase">
            {meta}
          </span>
        ) : null}
        {detail ? (
          <span className="text-muted-foreground text-sm leading-snug md:text-xs">
            {detail}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors md:size-6 md:border",
          checked
            ? "border-white bg-white text-neutral-900"
            : "border-white/30 group-hover:border-white/50",
        )}
      >
        {checked ? <CheckIcon weight="bold" className="size-4" /> : null}
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
 * The size tracks how much width the card actually has, which is NOT monotonic
 * with the viewport: the option grid goes to two columns at `sm`, so a card is
 * at its NARROWEST (~265px) there, not on a phone. Hence 56px below `xs`
 * (a 320px screen has ~180px left for three lines of text), 72px on a normal
 * phone where the card is full-width, back DOWN to 64px at `sm`, then up again
 * at `md`/`lg` where the columns are finally wide enough to afford it.
 *
 * `alt` is intentionally empty — the card's own title names the bag, so giving
 * the image a label would make a screen reader announce it twice.
 */
export function BagPreview({ src }: { src: string }) {
  return (
    <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/35 xs:size-18 sm:size-16 md:size-20 lg:size-24">
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
        sizes="(min-width: 1024px) 96px, (min-width: 768px) 80px, (min-width: 640px) 64px, (min-width: 352px) 72px, 56px"
        className="object-contain p-1"
      />
    </span>
  );
}

/** Inline field-level error, styled to match the app's destructive treatment. */
export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="text-sm leading-relaxed text-red-300" role="alert">
      {children}
    </p>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ImageSquareIcon } from "@phosphor-icons/react";

import { PREVIEW_SLIDE_MS } from "@/lib/partner-jobs/types";
import type { DesignJobPreview } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/**
 * The artwork preview on a job card: one image, or a slow crossfade through
 * several.
 *
 * PERFORMANCE IS THE DESIGN HERE, not a refinement of it. Production artwork in
 * this bucket runs to 4.3 MB a file, and a grid can hold dozens of cards, so the
 * naive version of this component downloads a few hundred megabytes. Four things
 * prevent that, and none of them are optional:
 *
 *   1. Bytes come from `?thumb=1`, which is a ~55 KB WebP rendered by Supabase's
 *      image transform — never the original object. (See the route.)
 *   2. Only the FIRST image is in the DOM until the card has been on screen.
 *      Scrolling quickly past a card costs one thumbnail, not four.
 *   3. The interval only runs while the card is actually visible. An
 *      IntersectionObserver, not a timer per card — fifty offscreen cards run
 *      zero timers between them.
 *   4. `loading="lazy"` means even that first image is deferred until it is near
 *      the viewport.
 *
 * NO LAYOUT SHIFT: the frame is a fixed square (matching the 640x640 transform,
 * so the thumbnail is never scaled to a different aspect and cropped twice), and
 * the images are absolutely positioned inside it. Nothing reflows as they cycle.
 *
 * The whole thing is `pointer-events-none` and `aria-hidden`: it sits inside a
 * link whose accessible name is the job's number and name, so a slideshow of
 * decorative crops has nothing to add to a screen reader and must not intercept
 * the click.
 */
export function JobPreview({
  previews,
  className,
}: {
  previews: DesignJobPreview[];
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  // Latches: once a card has been seen, its other images stay mounted so
  // scrolling back does not re-fetch them.
  const [revealed, setRevealed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  const usable = previews.filter((p) => !failed.has(p.id));
  const multiple = usable.length > 1;

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // No IntersectionObserver at all (a non-browser test env; no shipping
    // browser that runs React 19 lacks it) degrades to a static first image
    // rather than a frozen empty box — nothing below runs, image 0 is already
    // mounted, and the card still links through. Deliberately not "assume
    // visible": that would have to be decided during render, and the server and
    // the browser would disagree about it.
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setRevealed(true);
      },
      // A little margin so a card is ready by the time it is scrolled to.
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!multiple || !visible || paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % usable.length),
      PREVIEW_SLIDE_MS,
    );
    return () => window.clearInterval(id);
  }, [multiple, visible, paused, usable.length]);

  // A file removed from the job (or one that failed to render) must not leave
  // the slideshow parked on an index that no longer exists.
  const current = usable.length > 0 ? index % usable.length : 0;

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "bg-glass-highlight/10 relative aspect-square w-full overflow-hidden",
        className,
      )}
    >
      {usable.length === 0 ? (
        <div className="text-muted-foreground/50 flex h-full w-full flex-col items-center justify-center gap-2">
          <ImageSquareIcon className="size-7" weight="thin" />
          <span className="text-[11px] tracking-wide uppercase">No preview</span>
        </div>
      ) : (
        usable.map((preview, i) => {
          // Image 0 always; the rest only after the card has been on screen.
          if (i > 0 && !revealed) return null;
          return (
            /* eslint-disable-next-line @next/next/no-img-element -- the src is
               a short-lived signed redirect to a Supabase-rendered 640px WebP.
               next/image would re-optimize an already-optimized thumbnail
               through Vercel's optimizer, which this project cannot use at all:
               it returns OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED in production.
               Same call as /whiteash and /portfolio. */
            <img
              key={preview.id}
              src={`/api/partner-job-files/${preview.id}?thumb=1`}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() =>
                setFailed((prev) => {
                  if (prev.has(preview.id)) return prev;
                  const next = new Set(prev);
                  next.add(preview.id);
                  return next;
                })
              }
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out",
                i === current ? "opacity-100" : "opacity-0",
              )}
            />
          );
        })
      )}

      {multiple ? (
        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-2">
          {usable.map((preview, i) => (
            <span
              key={preview.id}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                i === current
                  ? "w-3 bg-white/85"
                  : "w-1 bg-white/40",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

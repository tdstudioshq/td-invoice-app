"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretLeftIcon,
  CaretRightIcon,
  XIcon,
} from "@phosphor-icons/react";

import type { PortfolioImage } from "@/lib/portfolio";

/**
 * Premium fullscreen lightbox. Driven entirely by the parent's `index`
 * (null = closed) so it always reflects the currently filtered set. Supports
 * keyboard arrows + Esc, click-outside-to-close, mobile swipe, an image
 * counter, and a blurred backdrop. Pure presentational — no data fetching.
 */
export function PortfolioLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: PortfolioImage[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : null;

  const goPrev = useCallback(() => {
    if (index === null || images.length === 0) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }, [index, images.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (index === null || images.length === 0) return;
    onIndexChange((index + 1) % images.length);
  }, [index, images.length, onIndexChange]);

  // Keyboard: arrows navigate, Esc closes. Also lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") goPrev();
      else if (event.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose, goPrev, goNext]);

  // Touch swipe (horizontal) for mobile prev/next.
  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    const SWIPE_THRESHOLD = 48;
    if (deltaX > SWIPE_THRESHOLD) goPrev();
    else if (deltaX < -SWIPE_THRESHOLD) goNext();
    touchStartX.current = null;
  };

  return (
    <AnimatePresence>
      {open && current ? (
        <motion.div
          key="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Image ${index + 1} of ${images.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Clicking the backdrop (but not its children) closes.
          onClick={onClose}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl sm:p-8"
        >
          {/* Counter */}
          <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium tabular-nums text-white/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md">
            {index + 1} / {images.length}
          </div>

          {/* Close */}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md transition-colors hover:bg-white/[0.14]"
          >
            <XIcon weight="bold" className="size-5" />
          </button>

          {/* Prev / Next */}
          {images.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrev();
                }}
                className="absolute left-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md transition-colors hover:bg-white/[0.14] sm:left-6"
              >
                <CaretLeftIcon weight="bold" className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                className="absolute right-3 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)] backdrop-blur-md transition-colors hover:bg-white/[0.14] sm:right-6"
              >
                <CaretRightIcon weight="bold" className="size-5" />
              </button>
            </>
          ) : null}

          {/* Image — stopPropagation so clicks on it don't close. */}
          <motion.img
            key={current.id}
            src={current.url}
            alt={current.title}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

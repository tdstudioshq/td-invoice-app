"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { XIcon } from "@phosphor-icons/react";

// Client gallery with an in-page expand overlay (lightbox). Clicking a design
// enlarges it in place rather than opening the file in a new tab, and a few
// deterrents (no context menu, no drag) discourage casual saving. These can't
// truly prevent a determined save (screenshots/devtools always can), but they
// stop the obvious right-click / drag-to-desktop / open-in-new-tab paths.
export function DesignsGallery({ images }: { images: string[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isOpen = openIndex !== null;

  const close = useCallback(() => setOpenIndex(null), []);

  // Close on Escape and lock body scroll while the overlay is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  const noSave = (e: React.MouseEvent) => e.preventDefault();

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpenIndex(i)}
            aria-label="Expand design"
            className="group relative block aspect-[4/5] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] transition-all hover:border-white/25 hover:bg-white/[0.08]"
          >
            <Image
              src={src}
              alt="TD Studios premade design"
              fill
              sizes="(max-width: 640px) 50vw, 33vw"
              // 4:5 cell matches the 4:5 source, so object-contain shows the
              // full design with no cropping while keeping a uniform grid.
              className="pointer-events-none object-contain transition-transform duration-300 select-none group-hover:scale-[1.02]"
              draggable={false}
            />
            {/* Transparent layer absorbs long-press / right-click so the <img>
                itself is never the save target. */}
            <span
              className="absolute inset-0"
              onContextMenu={noSave}
              aria-hidden
            />
          </button>
        ))}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded design"
          onClick={close}
          onContextMenu={noSave}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            <XIcon weight="bold" className="size-5" />
          </button>

          {/* Stop propagation so clicking the image doesn't close the overlay. */}
          <div
            className="relative flex max-h-[90vh] max-w-[95vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[openIndex]}
              alt="TD Studios premade design"
              width={1440}
              height={1795}
              sizes="95vw"
              priority
              className="h-auto max-h-[90vh] w-auto max-w-[95vw] rounded-lg object-contain select-none"
              draggable={false}
              onContextMenu={noSave}
            />
            <span
              className="absolute inset-0"
              onContextMenu={noSave}
              aria-hidden
            />
          </div>
        </div>
      )}
    </>
  );
}

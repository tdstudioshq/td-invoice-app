"use client";

import { useState } from "react";
import { ImageIcon } from "@phosphor-icons/react";

import type { PortfolioImage } from "@/lib/portfolio";
import { PortfolioImageCard } from "@/app/portfolio/portfolio-image-card";
import { PortfolioLightbox } from "@/app/portfolio/portfolio-lightbox";

/**
 * Client gallery: a responsive masonry grid of every portfolio image plus the
 * fullscreen lightbox. The category/search model still lives in
 * `lib/portfolio.ts` (data-driven, pure) so a filter bar can be reintroduced
 * later without touching the renderer — it's just not surfaced in the UI today.
 */
export function PortfolioGallery({ images }: { images: PortfolioImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-20 text-center">
        <ImageIcon weight="duotone" className="size-10 text-white/40" />
        <p className="text-sm font-medium text-white/80">
          No portfolio images yet.
        </p>
        <p className="max-w-sm text-xs text-white/50">
          Upload images to the custom-work bucket and they&apos;ll appear here
          automatically.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="columns-2 gap-4 sm:columns-3 lg:columns-4">
        {images.map((image, index) => (
          <PortfolioImageCard
            key={image.id}
            image={image}
            // Eager-load the first screenful so the top of the gallery paints
            // immediately on mobile; the rest lazy-load on scroll.
            priority={index < 8}
            onOpen={() => setLightboxIndex(index)}
          />
        ))}
      </div>

      <PortfolioLightbox
        images={images}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onIndexChange={setLightboxIndex}
      />
    </>
  );
}

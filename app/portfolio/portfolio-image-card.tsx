"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { PortfolioImage } from "@/lib/portfolio";

/**
 * A single masonry card. Renders a shimmering skeleton at a placeholder aspect
 * ratio until the image loads, then snaps the box to the image's true ratio and
 * fades it in — so aspect ratio is preserved with no distortion and minimal
 * layout shift.
 *
 * `priority` images (the first screenful) load eagerly with a high fetch
 * priority so the top of the gallery paints immediately on mobile; the rest lazy
 * load as they approach the viewport, keeping 100+ images cheap.
 *
 * Note: these `<img>` tags are server-rendered, so on a fast connection an image
 * can finish loading *before* React hydrates and attaches `onLoad` — which would
 * leave the card stuck on its skeleton. We guard against that by checking
 * `img.complete` on mount and reconciling immediately.
 */
export function PortfolioImageCard({
  image,
  priority = false,
  onOpen,
}: {
  image: PortfolioImage;
  priority?: boolean;
  onOpen: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);

  function markLoaded(el: HTMLImageElement) {
    if (el.naturalWidth && el.naturalHeight) {
      setRatio(el.naturalWidth / el.naturalHeight);
    }
    setLoaded(true);
  }

  // Catch images that already finished loading before hydration (cached/fast
  // connections, very common on mobile) so they never get stuck behind the
  // skeleton waiting for an onLoad that already fired.
  useEffect(() => {
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) markLoaded(el);
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${image.title}`}
      className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div
        className="relative w-full"
        // Reserve space before load with a portrait placeholder, then use the
        // image's real ratio so it fills the box exactly (no crop, no stretch).
        style={{ aspectRatio: ratio ?? 3 / 4 }}
      >
        {/* Skeleton shimmer */}
        {!loaded ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.08] via-white/[0.04] to-transparent" />
        ) : null}

        {/* eslint-disable-next-line @next/next/no-img-element -- public Supabase
            Storage URLs rendered with native lazy loading; intentionally not
            routed through next/image (no optimization config, 100+ images). */}
        <img
          ref={imgRef}
          src={image.url}
          alt={image.title}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={(event) => markLoaded(event.currentTarget)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.04]",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Glass overlay on hover */}
        <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="line-clamp-1 px-4 pb-3.5 text-left text-sm font-medium text-white drop-shadow">
            {image.title}
          </span>
        </div>
      </div>
    </button>
  );
}

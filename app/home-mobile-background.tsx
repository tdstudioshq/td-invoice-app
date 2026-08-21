"use client";

import { useRef } from "react";
import Image from "next/image";

import { useScrollParallax } from "@/app/use-home-scroll";

import ticket from "@/public/home-mobile-bg.jpg";

/**
 * Mobile-only backdrop for the homepage "link in bio" card.
 *
 * The scratch-off ticket artwork is a single tall graphic, so it is `contain`-fit
 * rather than cropped — nothing gets cut off on either axis and any leftover
 * space letterboxes to black. It is `fixed` (not `absolute`) so it measures the
 * viewport itself: the card can grow past one screen and scroll without the
 * artwork stretching with it.
 *
 * Hidden from `md` up, where `AnimatedBackground` takes over.
 *
 * `unoptimized` + a pre-sized source, matching `AnimatedBackground` and for the
 * same reason: the project's Vercel image optimization allowance is exhausted,
 * so every uncached transform returns 402
 * (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED) and the image renders as a blank
 * black panel in production. The source is already stored at its delivery size
 * (572x1024 / 276KB), which is ample for a phone-width backdrop sitting behind
 * a scrim and a vignette, so serving it directly costs less than a transform
 * would have.
 *
 * No `sizes`: with `unoptimized` there is no srcset to select from, so it would
 * be inert. `placeholder="blur"` still works — the blurDataURL comes from the
 * static import at build time, not from the optimizer.
 */
export function HomeMobileBackground() {
  const artRef = useRef<HTMLDivElement>(null);

  /*
   * Depth on scroll. `contain` fit on a 572x1024 source leaves a tall black
   * letterbox band above and below the art on every phone aspect ratio (~70px
   * a side at 390x844), so shifting the art a few px inside its own frame never
   * exposes an edge — the bands just breathe, black on black, while the artwork
   * lags the content. Deliberately tiny: the fixed backdrop already re-composites
   * under the card's backdrop-filter on every scroll frame, so this adds one
   * compositor transform and no new per-frame work.
   */
  useScrollParallax(artRef, { factor: -0.08, max: 14 });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 bg-black md:hidden"
    >
      <div ref={artRef} className="absolute inset-0 will-change-transform">
        <Image
          src={ticket}
          alt=""
          fill
          priority
          unoptimized
          placeholder="blur"
          className="object-contain"
        />
      </div>

      {/*
        Readability stack, in three layers rather than one flat tint.

        The ticket is the brightest artwork on the site — a diamond-encrusted
        wordmark over foil red — and `contain` fit means the crop shifts with
        every viewport ratio, so which part of it lands behind the card is not
        something the layout can pin down. The protection therefore has to be
        strongest exactly where the card sits and weakest everywhere else,
        instead of dimming the whole page until the art stops being the art.

        Base tint drops from 45% to 40% so more of the ticket survives at the
        margins; the elliptical scrim then adds ~55% over the middle band where
        the card lands, taking the composite behind the glass to ~73% black
        while the edges stay near where they already were.
      */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_88%_52%_at_50%_47%,rgba(0,0,0,0.55),transparent_72%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(0,0,0,0.7))]" />
    </div>
  );
}

import Image from "next/image";

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
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 bg-black md:hidden"
    >
      <Image
        src={ticket}
        alt=""
        fill
        priority
        unoptimized
        placeholder="blur"
        className="object-contain"
      />

      {/* Scrim + vignette so the glass card stays legible over the busy art. */}
      <div className="absolute inset-0 bg-black/45" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(0,0,0,0.7))]" />
    </div>
  );
}

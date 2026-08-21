"use client";

import Image from "next/image";

import diamonds from "@/public/login-diamonds.webp";

/**
 * Full-screen background for the sign-in screen.
 *
 * A falling-diamonds photo sits at the base, dimmed by a dark tint + vignette
 * so the centered auth card stays legible. Over it, a few large, very dark
 * radial glows slowly drift (pure CSS, no deps). All motion is paused under
 * `prefers-reduced-motion`.
 *
 * Rendered as `absolute inset-0` inside a `relative` container (the login
 * `<main>`) so it sits above the opaque body background but behind the card.
 */
export function AnimatedBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
    >
      {/*
        Base diamond photo.

        `unoptimized` + a pre-sized source, deliberately. This background
        renders on ~21 public pages, and the project's Vercel image
        optimization allowance is exhausted: every uncached transform returns
        402 (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED), which is what made this
        render as a blank black panel in production. Upgrading to Next 16.3.1
        changed static-media hashing, so every previously cached transform
        became a miss at once and the breakage surfaced sitewide.

        The source is therefore stored at its delivery size instead of being
        transformed on demand: 2560px WebP, which covers retina desktop for an
        image sitting behind a vignette, drifting glows, and a grid overlay.
        That took it from 5824x3264 / 4.9MB JPEG to 2560x1435 / 144KB WebP, so
        serving it directly is far lighter than it ever was via the optimizer.

        No `sizes`: with `unoptimized` there is no srcset to select from, so it
        would be inert. `placeholder="blur"` still works — the blurDataURL is
        produced from the static import at build time, not by the optimizer.
      */}
      <Image
        src={diamonds}
        alt=""
        fill
        priority
        unoptimized
        placeholder="blur"
        className="object-cover"
      />

      {/*
        Dark scrim to keep text legible over the photo.

        This is not decorative. The diamonds are specular: measured across the
        source, 10% of the image exceeds 137/255 luminance and the highlights
        reach 250 — and the brightest ones sit dead centre, exactly where the
        cards land. With no scrim, secondary text over this photo measures as
        low as 1.1:1.

        30% is deliberately modest. It does the isolation work together with the
        panel tint on top of it, rather than alone: carrying the whole burden
        here would need ~65-80% black, which would flatten the diamonds into a
        dark smear and lose the background entirely. At 30% the photo still
        reads between the panels.

        The vignette below only darkens the EDGES (`transparent 55%`), so it
        never covered the centre where the content sits — which is why this
        layer, not that one, is what makes centred text readable.
      */}
      <div className="absolute inset-0 bg-black/30" />

      {/* Slowly drifting dark glows. */}
      <div className="tdbg-glow tdbg-glow-1" />
      <div className="tdbg-glow tdbg-glow-2" />
      <div className="tdbg-glow tdbg-glow-3" />

      {/* Faint grid, masked to fade at the edges. */}
      <div className="tdbg-grid absolute inset-0" />

      {/* Vignette to keep focus on the centered card. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_55%,rgba(0,0,0,0.65))]" />

      <style>{`
        .tdbg-glow {
          position: absolute;
          width: 38rem;
          height: 38rem;
          border-radius: 9999px;
          filter: blur(80px);
        }
        .tdbg-glow-1 {
          top: -9rem;
          left: -7rem;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.06), transparent 70%);
          animation: tdbg-drift-1 26s ease-in-out infinite;
        }
        .tdbg-glow-2 {
          right: -7rem;
          bottom: -10rem;
          background: radial-gradient(circle, rgba(148, 163, 184, 0.07), transparent 70%);
          animation: tdbg-drift-2 32s ease-in-out infinite;
        }
        .tdbg-glow-3 {
          top: 28%;
          left: 42%;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.04), transparent 70%);
          animation: tdbg-drift-3 38s ease-in-out infinite;
        }
        .tdbg-grid {
          background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 44px 44px;
          -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 25%, transparent 75%);
          mask-image: radial-gradient(circle at 50% 50%, #000 25%, transparent 75%);
        }
        @keyframes tdbg-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6rem, 4rem) scale(1.12); }
        }
        @keyframes tdbg-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-6rem, -4rem) scale(1.18); }
        }
        @keyframes tdbg-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(4rem, -3rem) scale(1.1); }
          66% { transform: translate(-4rem, 3rem) scale(1.06); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tdbg-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}

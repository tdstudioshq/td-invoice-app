"use client";

/**
 * Full-screen animated near-black background for the sign-in screen.
 *
 * Pure CSS — no JS and no extra dependencies: a few large, very dark radial
 * glows slowly drift over a black base, with a faint masked grid and a vignette.
 * Tuned to the minimal TD Studios palette (grayscale, no color). All motion is
 * paused under `prefers-reduced-motion`.
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
      {/* Base radial wash, slightly lifted toward the top. */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,#111114,#000000)]" />

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

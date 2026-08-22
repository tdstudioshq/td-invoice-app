import ticket from "@/public/home-mobile-bg.jpg";

/**
 * Mobile-only backdrop for the homepage "link in bio" card.
 *
 * The tufted casino artwork is `cover`-fit for a full-bleed background. It is
 * rendered as one background layer on the homepage shell.
 *
 * Hidden from `md` up, where `AnimatedBackground` takes over.
 *
 * A plain CSS background is deliberate. Mobile Safari can discard a fixed,
 * GPU-promoted image layer when it sits beneath a live backdrop-filter, which
 * reveals the black fallback after a few seconds. Painting the imported,
 * build-hashed asset directly onto this non-transformed layer avoids that
 * compositor path and avoids the project's exhausted image optimizer.
 */
export function HomeMobileBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 bg-black bg-cover bg-center bg-no-repeat md:hidden"
      style={{ backgroundImage: `url(${ticket.src})` }}
    />
  );
}

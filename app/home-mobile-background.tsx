import icee from "@/public/home-bg-mobile.webp";

/**
 * Mobile-only backdrop for the homepage "link in bio" card.
 *
 * The ICEE Dunny print sheet (`public/home-bg-mobile.webp`, a 900x1600
 * phone-shaped crop, pre-sized because the image optimizer is out of the
 * delivery path) is `cover`-fit for a full-bleed background.
 *
 * Hidden from `md` up, where `AnimatedBackground` takes over.
 *
 * FIXED, so the card scrolls over a still backdrop — but only in this exact
 * shape, and the shape is the point. An earlier version was also fixed and
 * mobile Safari dropped it to black a few seconds in: that one was a fixed
 * wrapper holding a `next/image` inside a `will-change: transform` layer that a
 * scroll parallax translated, i.e. a GPU-promoted image layer under a live
 * `backdrop-filter`, which WebKit is known to discard. This is a single plain
 * element with a CSS `background-image` from a build-hashed static import: no
 * <img>, no transform, no `will-change`, no parallax. Keep it that way — adding
 * any of those back reintroduces the promoted layer.
 *
 * `h-lvh` (the LARGE viewport height), not `inset-0`: a fixed box pinned to all
 * four edges resizes as Safari's toolbar collapses, and `bg-cover` would
 * rescale the artwork mid-scroll. Sized to the largest viewport it never
 * changes height, so the image stays put. `background-attachment: fixed` is not
 * an option — iOS Safari ignores it.
 */
export function HomeMobileBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh bg-black bg-cover bg-center bg-no-repeat md:hidden"
      style={{ backgroundImage: `url(${icee.src})` }}
    />
  );
}

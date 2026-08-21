"use client";

import { useEffect, type RefObject } from "react";

/**
 * One shared, rAF-throttled scroll subscription for the homepage.
 *
 * The homepage has two scroll-linked effects (the mobile backdrop's parallax
 * and the glass card's reflection) and both want the same value on the same
 * frame, so they share a single passive listener and a single rAF instead of
 * registering one each. Nothing here writes to `:root`: a custom property on
 * the document element would invalidate style for every node on the page each
 * frame, where writing `translate` straight onto the two elements that move
 * stays on the compositor.
 */
type Subscriber = (scrollY: number) => void;

const subscribers = new Set<Subscriber>();
let frame = 0;
let listening = false;

function flush() {
  frame = 0;
  const y = window.scrollY;
  for (const subscriber of subscribers) subscriber(y);
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(flush);
}

function subscribe(subscriber: Subscriber) {
  subscribers.add(subscriber);
  if (!listening) {
    window.addEventListener("scroll", schedule, { passive: true });
    listening = true;
  }
  subscriber(window.scrollY);

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size > 0 || !listening) return;
    window.removeEventListener("scroll", schedule);
    listening = false;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}

/**
 * Translate `ref` vertically as the page scrolls, by `scrollY * factor` clamped
 * to `±max` px. A negative factor moves the element against the content, which
 * is what reads as a distant layer.
 *
 * Phone-only and motion-sensitive: the subscription is torn down entirely (and
 * the inline `translate` cleared) from `md` up or under
 * `prefers-reduced-motion: reduce`, so desktop never pays for it and a reduced
 * motion viewer gets a completely static composition. Both media queries are
 * watched live, so rotating a phone into a tablet-width landscape or flipping
 * the OS setting takes effect without a reload.
 */
export function useScrollParallax(
  ref: RefObject<HTMLElement | null>,
  { factor, max }: { factor: number; max: number },
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const phone = window.matchMedia("(max-width: 767px)");
    const stillness = window.matchMedia("(prefers-reduced-motion: reduce)");
    let unsubscribe: (() => void) | null = null;

    const apply = (scrollY: number) => {
      const offset = Math.min(max, Math.max(-max, scrollY * factor));
      el.style.translate = `0 ${offset.toFixed(2)}px`;
    };

    const sync = () => {
      const wanted = phone.matches && !stillness.matches;
      if (wanted === Boolean(unsubscribe)) return;
      if (wanted) {
        unsubscribe = subscribe(apply);
      } else {
        unsubscribe?.();
        unsubscribe = null;
        el.style.translate = "";
      }
    };

    sync();
    phone.addEventListener("change", sync);
    stillness.addEventListener("change", sync);

    return () => {
      phone.removeEventListener("change", sync);
      stillness.removeEventListener("change", sync);
      unsubscribe?.();
      el.style.translate = "";
    };
  }, [ref, factor, max]);
}

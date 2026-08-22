"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { GlassCard } from "@developer-hub/liquid-glass";
import { toast } from "sonner";
import {
  AppleLogoIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ChatCircleTextIcon,
  CurrencyDollarIcon,
  ImagesIcon,
  PackageIcon,
  PaintBrushIcon,
  SquaresFourIcon,
  type Icon,
} from "@phosphor-icons/react";
import { SocialIcon } from "react-social-icons";

import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { LoginForm } from "@/app/login/login-form";
import { useScrollParallax } from "@/app/use-home-scroll";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The "link in bio" buttons. Edit the labels and `href`s here to point at the
 * real destinations — the Admin button is rendered separately and flips the card
 * into the sign-in form instead of navigating. `sameTab` covers both app routes
 * and `sms:`-style handoffs: opening either in a new tab is wrong, since the OS
 * takes over the navigation and leaves an empty tab behind.
 *
 * `sticky` marks the one link the phone-only floating CTA mirrors once it
 * scrolls out of view. It is a flag rather than a second hardcoded href so the
 * two can never drift apart.
 */
const BIO_LINKS: {
  label: string;
  href: string;
  icon: Icon;
  sameTab?: boolean;
  sticky?: boolean;
}[] = [
  {
    // E.164 number so both iOS and Android open their messaging app with the
    // recipient prefilled. No `?body=` — the two platforms disagree on the
    // separator, and a wrong one swallows the number on iOS.
    label: "Text Me",
    href: "sms:+19297528373",
    icon: ChatCircleTextIcon,
    sameTab: true,
  },
  {
    label: "Custom Mylar Printing",
    href: "/mylar-printing",
    icon: PackageIcon,
    sameTab: true,
    sticky: true,
  },
  {
    // Points at the Instagram grid rather than the in-app /premadedesigns
    // gallery. External, so it deliberately drops `sameTab` and opens in a new
    // tab — leaving the bio card behind in the original one.
    label: "Premade Designs",
    href: "https://instagram.com/tdstudiosco",
    icon: ImagesIcon,
  },
  {
    label: "Request Custom Design",
    href: "/custom-design-request",
    icon: PaintBrushIcon,
    sameTab: true,
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: SquaresFourIcon,
    sameTab: true,
  },
];

const STICKY_LINK = BIO_LINKS.find((link) => link.sticky);

/**
 * Chime publishes no per-user pay URL for a $ChimeSign — the handle only works
 * inside their app — so the Chime badge copies this to the clipboard instead of
 * linking anywhere. Replace the badge with an `<a>` if Chime ever ships one.
 */
const CHIME_SIGN = "$tyler-diorio-1";

/**
 * Chime's mark ships in neither react-social-icons nor Phosphor, so this is a
 * stand-in: the thick open ring from their logo. Drop in the official asset if
 * you have it.
 */
function ChimeMarkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M17.5 7a7 7 0 1 0 0 10"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/*
 * Phone-only tactile feedback.
 *
 * Every rule these attributes drive lives inside the `max-width: 767px` block
 * in the <style> below, so on a desktop pointer they would set a data attribute
 * that nothing reads and — with no animation to end — never clear it. The
 * matchMedia gate keeps the DOM honest; the MediaQueryList is cached because
 * these fire on every press.
 */
let phoneQuery: MediaQueryList | null = null;

function isPhone() {
  if (typeof window === "undefined") return false;
  phoneQuery ??= window.matchMedia("(max-width: 767px)");
  return phoneQuery.matches;
}

/** Kick off a button's light sweep. Fires on press, not on click, so the sweep
 *  has already started by the time an `href` hands the navigation off. */
function beginSweep(event: React.PointerEvent<HTMLElement>) {
  if (isPhone()) event.currentTarget.dataset.sweep = "1";
}

/** Kick off a badge's or the logo's press animation. */
function beginTap(event: React.PointerEvent<HTMLElement>) {
  if (isPhone()) event.currentTarget.dataset.tap = "1";
}

/*
 * These elements carry entrance animations too, and `animationend` from a
 * pseudo-element bubbles to its host, so both handlers match on the animation
 * name rather than clearing on whatever finishes first.
 */
function endSweep(event: React.AnimationEvent<HTMLElement>) {
  if (event.animationName === "home-sweep") {
    delete event.currentTarget.dataset.sweep;
  }
}

function endTap(event: React.AnimationEvent<HTMLElement>) {
  if (
    event.animationName === "home-pop" ||
    event.animationName === "home-logo-tap"
  ) {
    delete event.currentTarget.dataset.tap;
  }
}

/*
 * The bio buttons.
 *
 * Desktop keeps its exact box — `px-5 py-3.5 text-sm`, ~48px tall, lifting a
 * pixel on press. The `max-md:` half is the phone treatment: a 56px minimum
 * height with the label stepped up to 16px so the target clears 44px by a
 * comfortable margin rather than by a hair, and press feedback that scales
 * instead of nudging, since a 1px lift is invisible under a fingertip.
 *
 * `relative isolate overflow-hidden` is shared but inert on desktop: it exists
 * so the light-sweep pseudo-element has a stacking context to sit behind the
 * label in, and a rounded box to clip against.
 */
const glassButton =
  "home-btn relative isolate inline-flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-white/15 bg-black/35 px-5 py-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25 active:translate-y-px max-md:min-h-14 max-md:py-4 max-md:text-base max-md:duration-200 max-md:ease-[cubic-bezier(0.34,1.56,0.64,1)] max-md:active:scale-[0.97] max-md:active:border-white/40";

/**
 * The round brand badges under the title. Sized to the 40px circle that
 * react-social-icons renders for Instagram so the row reads as one set; each
 * badge supplies its own brand background.
 *
 * The 40px visual stays at every width — bumping it would move desktop — while
 * `.home-pop` widens the *hit* area to 48px on phones with an invisible inset
 * pseudo-element, so the touch target clears 44px without the layout changing.
 */
const socialBadge =
  "home-pop relative inline-flex size-10 items-center justify-center rounded-full transition-transform hover:scale-110 active:translate-y-px";

type Mode = "bio" | "signin" | "forgot";

export function HomeCard({
  redirectTo,
  justReset,
}: {
  redirectTo?: string;
  justReset?: boolean;
}) {
  // After a password reset we land on the sign-in form, not the bio links.
  const [mode, setMode] = useState<Mode>(justReset ? "signin" : "bio");
  const stickyAnchorRef = useRef<HTMLAnchorElement>(null);
  const sheenRef = useRef<HTMLSpanElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    if (justReset) {
      toast.success("Password updated. Sign in with your new password.");
    }
  }, [justReset]);

  const isBio = mode === "bio";
  const isSignin = mode === "signin";

  /*
   * The glass "catches light" as the page moves: a faint diagonal band that
   * drifts down the card while the content scrolls up past it. Slightly faster
   * than the backdrop's parallax and in the opposite direction, which is what
   * separates the two planes. Phone-only and disabled under reduced motion —
   * both gates live in the hook.
   */
  useScrollParallax(sheenRef, { factor: 0.1, max: 14 });

  /*
   * Mirror the Custom Mylar Printing CTA in a floating pill once the real one
   * leaves the viewport, and drop it again the moment it comes back. Driven by
   * the button's own visibility rather than a scroll threshold, so on a phone
   * tall enough to show the whole card — or in the sign-in view, where the
   * button does not exist — the pill simply never appears.
   */
  useEffect(() => {
    const anchor = stickyAnchorRef.current;
    if (!isBio || !anchor || typeof IntersectionObserver === "undefined") {
      setShowStickyCta(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [isBio]);

  // Clipboard writes reject on insecure origins and when the browser withholds
  // permission — surface the handle in the toast so it stays usable either way.
  const copyChimeSign = async () => {
    try {
      await navigator.clipboard.writeText(CHIME_SIGN);
      toast.success(`Chime handle ${CHIME_SIGN} copied`);
    } catch {
      toast.error(`Couldn't copy — my Chime is ${CHIME_SIGN}`);
    }
  };

  return (
    <>
      <GlassCard
        shadowMode
        cornerRadius={24}
        padding="0px"
        className="home-glass home-enter-card flex w-full justify-center"
      >
        {/* GlassCard sizes to its content, so we set an explicit, viewport-safe
            width here — otherwise the card collapses to a slim column and would
            resize when switching between the bio links and the sign-in form.
            Phones instead fill the shell: `.home-glass` gives the library's
            inner `.glass` element a width below `md`, which makes `w-full`
            resolvable and hands width control to the page padding, where the
            safe-area insets are already accounted for. */}
        <div className="relative flex w-full flex-col gap-5 p-5 md:w-[min(21rem,calc(100vw-2rem))] md:gap-6 md:p-8">
          {/* Reflection layer. Sits above the content on purpose — that is what
              a reflection does — which is why it peaks at 7.5% white: enough to
              read as a highlight travelling over the glass, far too little to
              move any contrast ratio in the card. */}
          <span ref={sheenRef} aria-hidden className="home-sheen md:hidden" />

          <div className="flex flex-col items-center gap-2 text-center">
            {/* The artwork is already a circular badge with its own gold outer
                ring, so no ring/inset highlight here — they'd trace a second
                edge just outside the mark. */}
            <div
              className="home-logo relative"
              onPointerDown={beginTap}
              onAnimationEnd={endTap}
            >
              <span aria-hidden className="home-logo-glow" />
              <Image
                src="/td-studios-diamond-logo.png"
                alt="TD Studios"
                width={112}
                height={112}
                priority
                className="home-logo-img size-24 rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] md:size-28"
              />
            </div>
            {isBio ? (
              <>
                <CardTitle className="home-enter-title text-3xl font-bold tracking-tight md:text-2xl">
                  TD STUDIOS
                </CardTitle>
                <div className="flex items-center justify-center gap-3 pt-1">
                  {/* Instagram is the only one of the four react-social-icons
                      ships a brand mark for; the rest are hand-built badges. */}
                  <SocialIcon
                    url="https://instagram.com/tdstudiosco"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                    className="home-pop home-enter-icon relative rounded-full transition-transform hover:scale-110 active:translate-y-px"
                    style={{ height: 40, width: 40 }}
                    onPointerDown={beginTap}
                    onAnimationEnd={endTap}
                  />
                  <a
                    href="https://cash.app/$tdiorio23"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Cash App $tdiorio23"
                    className={cn(
                      socialBadge,
                      "home-enter-icon bg-[#00D632] text-white",
                    )}
                    onPointerDown={beginTap}
                    onAnimationEnd={endTap}
                  >
                    <CurrencyDollarIcon weight="bold" className="size-5" />
                  </a>
                  {/* Same sms: handoff as the Text Me button, and same reason for
                      no target="_blank" — the OS takes the navigation and would
                      leave an empty tab behind. */}
                  <a
                    href="sms:+19297528373"
                    aria-label="Text me"
                    className={cn(
                      socialBadge,
                      "home-enter-icon bg-white text-black",
                    )}
                    onPointerDown={beginTap}
                    onAnimationEnd={endTap}
                  >
                    <AppleLogoIcon weight="fill" className="size-5" />
                  </a>
                  <button
                    type="button"
                    onClick={copyChimeSign}
                    aria-label={`Copy my Chime handle ${CHIME_SIGN}`}
                    className={cn(
                      socialBadge,
                      "home-enter-icon bg-[#1EC677] text-white",
                    )}
                    onPointerDown={beginTap}
                    onAnimationEnd={endTap}
                  >
                    <ChimeMarkIcon className="size-5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <CardTitle>{isSignin ? "Sign in" : "Reset password"}</CardTitle>
                <CardDescription>
                  {isSignin
                    ? "Access your TD Studios workspace."
                    : "Enter your email and we'll send you a reset link."}
                </CardDescription>
              </>
            )}
          </div>

          {isBio ? (
            <div className="flex flex-col gap-3">
              {BIO_LINKS.map(
                ({ label, href, icon: LinkIcon, sameTab, sticky }, index) => (
                  <a
                    key={label}
                    ref={sticky ? stickyAnchorRef : undefined}
                    href={href}
                    {...(sameTab ? {} : { target: "_blank", rel: "noreferrer" })}
                    className={cn(glassButton, "home-enter-btn")}
                    style={{ "--home-stagger": index } as React.CSSProperties}
                    onPointerDown={beginSweep}
                    onAnimationEnd={endSweep}
                  >
                    <LinkIcon weight="bold" className="size-4 max-md:size-5" />
                    {label}
                  </a>
                ),
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {isSignin ? (
                <LoginForm
                  redirectTo={redirectTo}
                  onForgot={() => setMode("forgot")}
                />
              ) : (
                <ForgotPasswordForm onBack={() => setMode("signin")} />
              )}
              <button
                type="button"
                onClick={() => setMode("bio")}
                className="text-on-photo text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
              >
                <ArrowLeftIcon weight="bold" className="size-3.5" />
                Back
              </button>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Rendered as a sibling of the card, never inside it: `.glass` combines
          `overflow: hidden` with a `backdrop-filter`, and a backdrop-filter makes
          its element the containing block for fixed-position descendants — a
          floating CTA nested in there would be pinned to the card and clipped by
          it instead of to the viewport. */}
      {STICKY_LINK ? (
        <div
          aria-hidden={!showStickyCta}
          inert={!showStickyCta}
          className={cn(
            "home-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden",
            showStickyCta
              ? "translate-y-0 opacity-100"
              : "translate-y-4 opacity-0",
          )}
        >
          <a
            href={STICKY_LINK.href}
            {...(STICKY_LINK.sameTab
              ? {}
              : { target: "_blank", rel: "noreferrer" })}
            tabIndex={showStickyCta ? undefined : -1}
            className="home-btn pointer-events-auto relative isolate inline-flex min-h-12 max-w-full items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-black/55 px-5 py-3 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.24),0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-[0.97] active:border-white/40"
            onPointerDown={beginSweep}
            onAnimationEnd={endSweep}
          >
            <PackageIcon weight="bold" className="size-4 shrink-0" />
            <span className="truncate">{STICKY_LINK.label}</span>
            <ArrowRightIcon weight="bold" className="size-4 shrink-0" />
          </a>
        </div>
      ) : null}

      {/*
        Every rule below is scoped to phones. Desktop renders the card exactly as
        it did before: no entrance, no idle motion, no press animations, and the
        library's own liquid-glass filter left intact.

        Plain CSS rather than the framer-motion already in the repo, on purpose.
        This is the landing page and the entrance is the first thing a visitor
        sees, so it should not wait on a ~40KB animation runtime to hydrate — as
        stylesheet animations these start at first paint, run on the compositor,
        and cost nothing in the bundle. Everything animates `opacity`, `scale` or
        `translate` only.
      */}
      <style>{`
        @media (max-width: 767px) {
          /*
           * Entrance. Roughly 1.1s end to end: card, then logo, then wordmark,
           * then the badges left to right, then the buttons top to bottom.
           * A "both" fill keeps each element in its "before" state until its turn.
           * Nothing here gates interaction — opacity and transforms do not block
           * pointer events, so every link is tappable from the first frame.
           */
          .home-enter-card {
            animation: home-rise 520ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
          }
          .home-logo {
            animation:
              home-logo-in 460ms cubic-bezier(0.22, 0.61, 0.36, 1) 140ms both,
              home-logo-float 5.5s ease-in-out 1.25s infinite;
          }
          .home-enter-title {
            animation: home-fade 400ms ease-out 260ms both;
          }
          .home-enter-icon {
            animation: home-pop-in 380ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
          }
          /* Left-to-right stagger. Four badges, so the selectors are cheaper to
             read than a per-element inline delay. */
          .home-enter-icon:nth-child(1) { animation-delay: 340ms; }
          .home-enter-icon:nth-child(2) { animation-delay: 395ms; }
          .home-enter-icon:nth-child(3) { animation-delay: 450ms; }
          .home-enter-icon:nth-child(4) { animation-delay: 505ms; }

          .home-enter-btn {
            animation: home-rise-sm 420ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
            animation-delay: calc(430ms + var(--home-stagger, 0) * 70ms);
          }

          /*
           * Light sweep, armed on press and disarmed on animationend. A
           * translucent diagonal band, oversized so its corners clear the
           * button, riding at z-index -1 inside the button's own stacking
           * context: above the button's background, below its label, so it can
           * never wash out the text.
           */
          .home-btn::before {
            content: "";
            position: absolute;
            inset: -60% -30%;
            z-index: -1;
            background: linear-gradient(
              72deg,
              transparent 42%,
              rgba(255, 255, 255, 0.28) 50%,
              transparent 58%
            );
            translate: -130% 0;
            opacity: 0;
            pointer-events: none;
          }
          .home-btn[data-sweep="1"]::before {
            animation: home-sweep 520ms cubic-bezier(0.22, 0.61, 0.36, 1);
          }

          /*
           * Badge press: dip, overshoot, settle, with the glow following the
           * scale. box-shadow is not a compositor property, but this runs on one
           * 40px circle for 300ms at a time, which is a different order of cost
           * from animating it continuously.
           */
          .home-pop[data-tap="1"] {
            animation: home-pop 300ms cubic-bezier(0.22, 0.61, 0.36, 1);
          }
          /* 48px touch target around the 40px visual, with the layout untouched. */
          .home-pop::after {
            content: "";
            position: absolute;
            inset: -4px;
            border-radius: 9999px;
          }

          /* Logo press: a short swell with the halo brightening behind it. */
          .home-logo[data-tap="1"] .home-logo-img {
            animation: home-logo-tap 380ms cubic-bezier(0.22, 0.61, 0.36, 1);
          }
          .home-logo[data-tap="1"] .home-logo-glow {
            animation: home-logo-glow 420ms ease-out;
          }
          .home-logo-glow {
            position: absolute;
            inset: 6%;
            border-radius: 9999px;
            opacity: 0;
            box-shadow: 0 0 22px 6px rgba(255, 255, 255, 0.4);
            pointer-events: none;
          }

          /* Reflection band. Oversized so the diagonal reaches every corner as
             it drifts, and pinned behind nothing — it is a highlight on the
             glass surface. */
          .home-sheen {
            position: absolute;
            inset: -22% -12%;
            pointer-events: none;
            background: linear-gradient(
              118deg,
              transparent 34%,
              rgba(255, 255, 255, 0.075) 46%,
              rgba(255, 255, 255, 0.02) 53%,
              transparent 64%
            );
            will-change: transform;
          }

          .home-sticky-cta {
            transition:
              opacity 260ms ease-out,
              translate 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
          }
        }

        @keyframes home-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes home-rise {
          from { opacity: 0; translate: 0 20px; }
          to { opacity: 1; translate: 0 0; }
        }
        @keyframes home-rise-sm {
          from { opacity: 0; translate: 0 12px; }
          to { opacity: 1; translate: 0 0; }
        }
        @keyframes home-logo-in {
          from { opacity: 0; scale: 0.92; }
          to { opacity: 1; scale: 1; }
        }
        @keyframes home-pop-in {
          from { opacity: 0; scale: 0.8; }
          to { opacity: 1; scale: 1; }
        }
        @keyframes home-logo-float {
          0%, 100% { translate: 0 0; }
          50% { translate: 0 -4px; }
        }
        @keyframes home-logo-tap {
          0% { scale: 1; }
          42% { scale: 1.08; }
          100% { scale: 1; }
        }
        @keyframes home-logo-glow {
          0% { opacity: 0; }
          35% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes home-sweep {
          0% { translate: -130% 0; opacity: 0; }
          12% { opacity: 1; }
          100% { translate: 130% 0; opacity: 0; }
        }
        @keyframes home-pop {
          0% { scale: 1; box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
          28% { scale: 0.92; box-shadow: 0 0 10px 1px rgba(255, 255, 255, 0.35); }
          62% { scale: 1.06; box-shadow: 0 0 16px 3px rgba(255, 255, 255, 0.28); }
          100% { scale: 1; box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
        }

        /*
         * Reduced motion. The page still assembles itself — a plain, quick
         * opacity fade keeps the sequence legible as an entrance — but nothing
         * travels, swells, floats or sweeps, and the scroll-linked parallax and
         * reflection drift are torn down in JS rather than merely stilled.
         */
        @media (prefers-reduced-motion: reduce) {
          .home-enter-card,
          .home-logo,
          .home-enter-title,
          .home-enter-icon,
          .home-enter-btn {
            animation-name: home-fade;
            animation-duration: 240ms;
            animation-timing-function: ease-out;
          }
          .home-btn[data-sweep="1"]::before,
          .home-pop[data-tap="1"],
          .home-logo[data-tap="1"] .home-logo-img,
          .home-logo[data-tap="1"] .home-logo-glow {
            animation: none;
          }
          .home-btn::before {
            display: none;
          }
          .home-sticky-cta {
            transition: opacity 160ms ease-out;
          }
        }
      `}</style>
    </>
  );
}

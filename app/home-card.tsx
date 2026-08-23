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
  /** Second line, top prize only — the plain-language version of the label. */
  sub?: string;
  href: string;
  icon: Icon;
  sameTab?: boolean;
  sticky?: boolean;
  /**
   * `prize` is the one full-width gold row; `tile` links pair off into the
   * two-column grid beneath it, in the order listed. Exactly one `prize` is
   * expected — a second would spend the accent twice and flatten the
   * hierarchy the ticket exists to create.
   */
  tier: "prize" | "tile";
}[] = [
  {
    // The label is the action, not the product name: a visitor who has just
    // landed needs the verb. The product name moves to `sub`.
    label: "Start Your Order",
    sub: "Custom mylar printing",
    href: "/mylar-printing",
    icon: PackageIcon,
    sameTab: true,
    sticky: true,
    tier: "prize",
  },
  {
    // E.164 number so both iOS and Android open their messaging app with the
    // recipient prefilled. No `?body=` — the two platforms disagree on the
    // separator, and a wrong one swallows the number on iOS.
    label: "Text Me",
    href: "sms:+19297528373",
    icon: ChatCircleTextIcon,
    sameTab: true,
    tier: "tile",
  },
  {
    label: "Custom Design",
    href: "/custom-design-request",
    icon: PaintBrushIcon,
    sameTab: true,
    tier: "tile",
  },
  {
    // Points at the Instagram grid rather than the in-app /premadedesigns
    // gallery. External, so it deliberately drops `sameTab` and opens in a new
    // tab — leaving the bio card behind in the original one.
    label: "Premade Designs",
    href: "https://instagram.com/tdstudiosco",
    icon: ImagesIcon,
    tier: "tile",
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: SquaresFourIcon,
    sameTab: true,
    tier: "tile",
  },
];

const PRIZE_LINK = BIO_LINKS.find((link) => link.tier === "prize");
const TILE_LINKS = BIO_LINKS.filter((link) => link.tier === "tile");

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
 * The bio buttons, in two tiers.
 *
 * `relative isolate overflow-hidden` is shared but inert on desktop: it exists
 * so the light-sweep pseudo-element has a stacking context to sit behind the
 * label in, and a rounded box to clip against. Press feedback scales rather
 * than nudging below `md`, since a 1px lift is invisible under a fingertip.
 *
 * Heights are deliberately only set from `md` up. On phones `--home-link-h` in
 * `globals.css` supplies the floor (never below 48px, so every target clears
 * 44px) and the flex rules there hand out the leftover card height — a fixed
 * height here would fight both.
 */
const buttonBase =
  "home-btn relative isolate inline-flex w-full overflow-hidden rounded-2xl transition-all active:translate-y-px max-md:duration-200 max-md:ease-[cubic-bezier(0.34,1.56,0.64,1)] max-md:active:scale-[0.97]";

/** The top prize: the only gold surface on the page. */
const prizeButton =
  "tk-prize-btn flex-col items-center justify-center gap-0.5 px-5 py-4 text-center md:min-h-[4.5rem]";

/** Secondary prizes. Quiet glass so the gold keeps its job. */
const tileButton =
  "tk-tile flex-col items-center justify-center gap-2 px-3 py-4 text-center text-white backdrop-blur-md md:min-h-[5.25rem] max-md:active:border-white/40";

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

/**
 * The payment + contact marks. They live in the ticket's footer rather than
 * under the wordmark: a ticket carries its small print at the bottom, and the
 * actions earn the space directly under the tear line.
 */
function SocialRow() {
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
            <div className="home-social-row flex items-center justify-center gap-3">
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
  );
}

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
        <div
          className={cn(
            "home-card-inner relative flex w-full flex-col gap-5 p-5 md:w-[min(21rem,calc(100vw-2rem))] md:gap-6 md:p-8",
            // The bio view fills the card's height with its buttons; the
            // sign-in view is a fixed-size block, so it centres as one group
            // instead. A modifier class rather than `:has()` — the state is
            // already in hand here, and this needs no selector support.
            !isBio && "home-card-inner--form",
          )}
        >
          {/* Reflection layer. On phones it tracks scroll with a faint drift;
              desktop gives the same layer a slow autonomous specular sweep.
              It stays beneath the content at both sizes. */}
          <span ref={sheenRef} aria-hidden className="home-sheen" />

          <div className="home-card-head flex flex-col items-center gap-2 text-center">
            {/* The artwork is already a circular badge with its own gold outer
                ring, so no ring/inset highlight here — they'd trace a second
                edge just outside the mark. */}
            <div
              className="home-logo relative"
              onPointerDown={beginTap}
              onAnimationEnd={endTap}
            >
              <span aria-hidden className="home-logo-glow" />
              {/* `unoptimized`: this project's Vercel image-optimization
                  allowance is exhausted, so every UNCACHED transform returns
                  402 and the image renders blank — which is exactly what a
                  freshly-swapped logo is. The source is already stored at
                  384px against a 112px max render, so the optimizer was buying
                  ~50 KB and costing the whole mark. Same treatment as
                  BagPreview and the site backgrounds. */}
              <Image
                src="/td-studios-diamond-logo.png"
                alt="TD Studios"
                width={112}
                height={112}
                priority
                unoptimized
                className="home-logo-img size-24 rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] md:size-28"
              />
            </div>
            {isBio ? (
              <>
                <CardTitle className="home-enter-title tk-wordmark font-bold">
                  TD STUDIOS
                </CardTitle>
                {/* Gold hairline + service line: the card never said what the
                    business actually does, which is the first thing a visitor
                    arriving from an Instagram bio needs to know. */}
                <div
                  aria-hidden
                  className="home-enter-title tk-rule-gold mt-1 w-16"
                />
                <p className="home-enter-title tk-eyebrow pt-1">
                  FULL SERVICE DESIGN &amp; PACKAGING AGENCY
                </p>
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
            <div className="home-card-links flex flex-col gap-3">
              {/* The tear line. Everything above it is who this is; everything
                  below it is what you can do. */}
              <div aria-hidden className="tk-perforation mx-1 mb-1" />

              {PRIZE_LINK ? (
                <a
                  ref={PRIZE_LINK.sticky ? stickyAnchorRef : undefined}
                  href={PRIZE_LINK.href}
                  {...(PRIZE_LINK.sameTab
                    ? {}
                    : { target: "_blank", rel: "noreferrer" })}
                  className={cn(buttonBase, prizeButton, "home-enter-btn")}
                  style={{ "--home-stagger": 0 } as React.CSSProperties}
                  onPointerDown={beginSweep}
                  onAnimationEnd={endSweep}
                >
                  <span className="tk-prize inline-flex items-center gap-2">
                    <PRIZE_LINK.icon
                      weight="fill"
                      className="size-6 shrink-0 opacity-80"
                    />
                    {PRIZE_LINK.label}
                  </span>
                  {PRIZE_LINK.sub ? (
                    <span className="tk-micro !text-black/70 !drop-shadow-none ![text-shadow:none]">
                      {PRIZE_LINK.sub}
                    </span>
                  ) : null}
                </a>
              ) : null}

              <div className="tk-tile-grid grid grid-cols-2 gap-3">
                {TILE_LINKS.map(
                  ({ label, href, icon: LinkIcon, sameTab }, index) => (
                    <a
                      key={label}
                      href={href}
                      {...(sameTab
                        ? {}
                        : { target: "_blank", rel: "noreferrer" })}
                      className={cn(buttonBase, tileButton, "home-enter-btn")}
                      // +1 so the prize keeps the first beat of the stagger.
                      style={
                        { "--home-stagger": index + 1 } as React.CSSProperties
                      }
                      onPointerDown={beginSweep}
                      onAnimationEnd={endSweep}
                    >
                      <LinkIcon
                        weight="bold"
                        className="size-5 shrink-0 opacity-70"
                      />
                      <span className="tk-tile-label">{label}</span>
                    </a>
                  ),
                )}
              </div>

              {/* Ticket footer: marks, then the small print. */}
              <div className="tk-footer mt-1 flex flex-col items-center gap-2.5">
                <SocialRow />
                <p className="tk-micro">@TDSTUDIOSCO &middot; NEW YORK</p>
              </div>
            </div>
          ) : (
            <div className="home-card-form flex flex-col gap-4">
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
          /*
           * Translate only — this animation MUST NOT touch opacity, filter,
           * mask or clip-path.
           *
           * .home-enter-card is .home-glass, the element whose child
           * .glass carries the card's backdrop-filter. Chromium promotes an
           * element with a filling opacity animation into a Backdrop Root and
           * never releases it, and a Backdrop Root is exactly "descendants
           * cannot sample anything painted behind me" — so a from{opacity:0}
           * here silently switches the card's frost off for the life of the
           * page. It computes and reports fine in devtools; it just never
           * composites. (Measured: the artwork behind the card had identical
           * high-frequency energy with the blur on and off.)
           *
           * Nothing is lost by dropping the fade. Every visible element inside
           * the card — logo, wordmark, badges, buttons — carries its own
           * staggered fade below, so the only thing that stopped fading is the
           * pane itself, which is 14% fill on phones.
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

          /* Match desktop's specular sweep. Transform carries the horizontal
             animation while the scroll hook owns the independent translate
             property for its small vertical parallax offset. */
          .home-sheen {
            position: absolute;
            inset: -32% -80%;
            z-index: 0;
            pointer-events: none;
            background: linear-gradient(
              116deg,
              transparent 42%,
              rgba(255, 255, 255, 0.025) 46%,
              rgba(255, 255, 255, 0.26) 50%,
              rgba(255, 255, 255, 0.045) 54%,
              transparent 58%
            );
            transform: translate3d(-76%, 0, 0);
            will-change: transform, translate, opacity;
            animation: home-glass-shine 6.8s ease-in-out infinite;
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
        /* Translate only, deliberately — see .home-enter-card above. */
        @keyframes home-rise {
          from { translate: 0 20px; }
          to { translate: 0 0; }
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
          /* The card itself drops out of the sequence entirely rather than
             joining the fade: home-fade animates opacity, which would put the
             frost back in the Backdrop Root trap described above. Its contents
             still fade, so the entrance still reads as one. */
          .home-enter-card {
            animation: none;
          }
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

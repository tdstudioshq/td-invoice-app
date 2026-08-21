"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { GlassCard } from "@developer-hub/liquid-glass";
import { toast } from "sonner";
import {
  AppleLogoIcon,
  ArrowLeftIcon,
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
import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The "link in bio" buttons. Edit the labels and `href`s here to point at the
 * real destinations — the Admin button is rendered separately and flips the card
 * into the sign-in form instead of navigating. `sameTab` covers both app routes
 * and `sms:`-style handoffs: opening either in a new tab is wrong, since the OS
 * takes over the navigation and leaves an empty tab behind.
 */
const BIO_LINKS: {
  label: string;
  href: string;
  icon: Icon;
  sameTab?: boolean;
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
  },
  {
    label: "Premade Designs",
    href: "/premadedesigns",
    icon: ImagesIcon,
    sameTab: true,
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

const glassButton =
  "inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-black/35 px-5 py-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25 active:translate-y-px";

/**
 * The round brand badges under the title. Sized to the 40px circle that
 * react-social-icons renders for Instagram so the row reads as one set; each
 * badge supplies its own brand background.
 */
const socialBadge =
  "inline-flex size-10 items-center justify-center rounded-full transition-transform hover:scale-110 active:translate-y-px";

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

  useEffect(() => {
    if (justReset) {
      toast.success("Password updated. Sign in with your new password.");
    }
  }, [justReset]);

  const isBio = mode === "bio";
  const isSignin = mode === "signin";

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
    <GlassCard
      shadowMode
      cornerRadius={24}
      padding="0px"
      className="flex w-full justify-center"
    >
      {/* GlassCard sizes to its content, so we set an explicit, viewport-safe
          width here — otherwise the card collapses to a slim column and would
          resize when switching between the bio links and the sign-in form. */}
      <div className="flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-6 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* The artwork is already a circular badge with its own white outer
              ring, so no ring/inset highlight here — they'd trace a second
              edge just outside the mark. */}
          <Image
            src="/td-studios-lottery-logo.png"
            alt="TD Studios"
            width={112}
            height={112}
            priority
            className="size-28 rounded-full drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          />
          {isBio ? (
            <>
              <CardTitle className="text-2xl font-bold tracking-tight">
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
                  className="transition-transform hover:scale-110 active:translate-y-px"
                  style={{ height: 40, width: 40 }}
                />
                <a
                  href="https://cash.app/$tdiorio23"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Cash App $tdiorio23"
                  className={cn(socialBadge, "bg-[#00D632] text-white")}
                >
                  <CurrencyDollarIcon weight="bold" className="size-5" />
                </a>
                {/* Same sms: handoff as the Text Me button, and same reason for
                    no target="_blank" — the OS takes the navigation and would
                    leave an empty tab behind. */}
                <a
                  href="sms:+19297528373"
                  aria-label="Text me"
                  className={cn(socialBadge, "bg-white text-black")}
                >
                  <AppleLogoIcon weight="fill" className="size-5" />
                </a>
                <button
                  type="button"
                  onClick={copyChimeSign}
                  aria-label={`Copy my Chime handle ${CHIME_SIGN}`}
                  className={cn(socialBadge, "bg-[#1EC677] text-white")}
                >
                  <ChimeMarkIcon className="size-5" />
                </button>
              </div>
            </>
          ) : (
            <>
              <CardTitle>
                {isSignin ? "Sign in" : "Reset password"}
              </CardTitle>
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
            {BIO_LINKS.map(({ label, href, icon: LinkIcon, sameTab }) => (
              <a
                key={label}
                href={href}
                {...(sameTab ? {} : { target: "_blank", rel: "noreferrer" })}
                className={glassButton}
              >
                <LinkIcon weight="bold" className="size-4" />
                {label}
              </a>
            ))}
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
  );
}

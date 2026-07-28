"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { GlassCard } from "@developer-hub/liquid-glass";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ChatCircleTextIcon,
  ImagesIcon,
  LockIcon,
  PaintBrushIcon,
  SquaresFourIcon,
  type Icon,
} from "@phosphor-icons/react";
import { SocialIcon } from "react-social-icons";

import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { GoogleSignInButton } from "@/app/login/google-sign-in-button";
import { LoginForm } from "@/app/login/login-form";
import { CardDescription, CardTitle } from "@/components/ui/card";

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
    label: "Premade Designs",
    href: "/qr-generator/designs",
    icon: ImagesIcon,
    sameTab: true,
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: SquaresFourIcon,
    sameTab: true,
  },
  {
    label: "Request Custom Design",
    href: "/custom-design-request",
    icon: PaintBrushIcon,
    sameTab: true,
  },
];

/**
 * Social/contact links, shown as colored icon buttons under the TD STUDIOS
 * title. Rendered with react-social-icons, which picks the brand icon + color
 * from the URL (wa.me → WhatsApp, mailto → email, …).
 */
const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: "Instagram", href: "https://instagram.com/tdstudiosco" },
  { label: "WhatsApp", href: "https://wa.me/19297528373" },
  { label: "Email", href: "mailto:tyler@tdstudiosny.com" },
];

const glassButton =
  "inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12] active:translate-y-px";

const iconButton =
  "inline-flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12] active:translate-y-px";

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
          <Image
            src="/logo.png"
            alt="TD Studios"
            width={56}
            height={56}
            priority
            className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
          />
          {isBio ? (
            <>
              <CardTitle className="text-2xl font-bold tracking-tight">
                TD STUDIOS
              </CardTitle>
              <div className="flex items-center justify-center gap-3 pt-1">
                {SOCIAL_LINKS.map(({ label, href }) => (
                  <SocialIcon
                    key={label}
                    url={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="transition-transform hover:scale-110 active:translate-y-px"
                    style={{ height: 40, width: 40 }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  aria-label="Admin sign in"
                  className={iconButton}
                >
                  <LockIcon weight="bold" className="size-5" />
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
            {/* Google OAuth doubles as signup: Supabase auto-creates the
                auth user on first sign-in, and /auth/callback routes new
                users into customer onboarding. Returning users just log in. */}
            <GoogleSignInButton
              label="Sign Up with Google"
              className={glassButton}
            />
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
              className="text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
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

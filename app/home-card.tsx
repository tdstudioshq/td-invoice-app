"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { GlassCard } from "@developer-hub/liquid-glass";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  EnvelopeSimpleIcon,
  ImagesIcon,
  InstagramLogoIcon,
  LockIcon,
  PaintBrushIcon,
  QrCodeIcon,
  SquaresFourIcon,
  StorefrontIcon,
  WhatsappLogoIcon,
  type Icon,
} from "@phosphor-icons/react";

import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { LoginForm } from "@/app/login/login-form";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The "link in bio" buttons. Edit the labels and `href`s here to point at the
 * real destinations — the Admin button is rendered separately and flips the card
 * into the sign-in form instead of navigating. `internal` links (app routes)
 * navigate in the same tab; the rest open in a new tab.
 */
const BIO_LINKS: {
  label: string;
  href: string;
  icon: Icon;
  internal?: boolean;
}[] = [
  {
    label: "Enter Here",
    href: "/mylar",
    icon: StorefrontIcon,
    internal: true,
  },
  {
    label: "Premade Designs",
    href: "/qr-generator/designs",
    icon: ImagesIcon,
    internal: true,
  },
  {
    label: "Portfolio",
    href: "/portfolio",
    icon: SquaresFourIcon,
    internal: true,
  },
  {
    label: "Request Custom Design",
    href: "/custom-design-request",
    icon: PaintBrushIcon,
    internal: true,
  },
  {
    label: "QR Code Generator",
    href: "/qr-generator",
    icon: QrCodeIcon,
    internal: true,
  },
];

/** Social/contact links, shown as icon buttons under the TD STUDIOS title. */
const SOCIAL_LINKS: { label: string; href: string; icon: Icon }[] = [
  {
    label: "Instagram",
    href: "https://instagram.com/tdstudiosco",
    icon: InstagramLogoIcon,
  },
  {
    label: "WhatsApp",
    href: "https://wa.me/19297528373",
    icon: WhatsappLogoIcon,
  },
  {
    label: "Email",
    href: "mailto:tyler@tdstudiosny.com",
    icon: EnvelopeSimpleIcon,
  },
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

  // iOS/Safari only autoplays muted, inline video — and React doesn't reliably
  // reflect the `muted` prop onto the element in time, so Safari sees a sounded
  // video and blocks autoplay (showing a play button). Set muted imperatively
  // and kick off playback once the <video> is mounted (bio mode). The catch
  // swallows the rejection when a browser still blocks it (e.g. Low Power Mode).
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    video.play().catch(() => {});
  }, [isBio]);

  return (
    <GlassCard
      shadowMode
      cornerRadius={24}
      padding="0px"
      className="flex w-full justify-center"
    >
      {/* GlassCard sizes to its content, so we set an explicit, viewport-safe
          width here — otherwise the card collapses to a slim column and would
          resize when switching between the bio links and the sign-in form. In
          bio mode the column also fills the mobile viewport height (minus the
          page's py-12) so the image box can grow to the bottom of the screen. */}
      <div
        className={cn(
          "flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-6 p-8",
          isBio && "min-h-[calc(100svh_-_6rem)] sm:min-h-0",
        )}
      >
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
                {SOCIAL_LINKS.map(({ label, href, icon: SocialIcon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className={iconButton}
                  >
                    <SocialIcon weight="bold" className="size-5" />
                  </a>
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
          <>
            <div className="flex flex-col gap-3">
              {BIO_LINKS.map(({ label, href, icon: LinkIcon, internal }) => (
                <a
                  key={label}
                  href={href}
                  {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
                  className={glassButton}
                >
                  <LinkIcon weight="bold" className="size-4" />
                  {label}
                </a>
              ))}
            </div>
            {/* Video box: grows to fill the leftover height so the card reaches
                the bottom of the viewport on mobile (see the column's min-h).
                Muted + playsInline so it autoplays on load on every browser. */}
            <div className="relative min-h-48 w-full flex-1 overflow-hidden rounded-2xl border border-white/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18)]">
              <video
                ref={videoRef}
                src="/home-showcase.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="TD Studios custom work showcase"
                className="absolute inset-0 size-full object-cover"
              />
            </div>
          </>
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

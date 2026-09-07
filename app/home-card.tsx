"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, ChatCircleTextIcon,
  ImagesIcon, PackageIcon, PaintBrushIcon, SquaresFourIcon,
} from "@phosphor-icons/react";
import { ForgotPasswordForm } from "@/app/login/forgot-password-form";
import { LoginForm } from "@/app/login/login-form";
import styles from "./home.module.css";

const ORDER = { label: "Start your order", href: "/mylar-printing" };
const LINKS = [
  { label: "Text me", href: "sms:+19297528373", icon: ChatCircleTextIcon, external: false },
  { label: "Custom design", href: "/custom-design-request", icon: PaintBrushIcon, external: false },
  { label: "Premade designs", href: "https://instagram.com/tdstudiosco", icon: ImagesIcon, external: true },
  { label: "Portfolio", href: "/portfolio", icon: SquaresFourIcon, external: false },
];
type Mode = "bio" | "signin" | "forgot";

export function HomeCard({ redirectTo, justReset }: { redirectTo?: string; justReset?: boolean }) {
  const [mode, setMode] = useState<Mode>(justReset ? "signin" : "bio");
  const orderRef = useRef<HTMLAnchorElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  const isBio = mode === "bio";

  useEffect(() => {
    if (justReset) toast.success("Password updated. Sign in with your new password.");
  }, [justReset]);

  useEffect(() => {
    const anchor = orderRef.current;
    if (!isBio || !anchor || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      // Only show after scrolling past the primary action, never before it.
      setShowSticky(!entry.isIntersecting && entry.boundingClientRect.bottom < 0);
    });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [isBio]);

  return (
    <>
      <section className={styles.card} aria-labelledby="home-title">
        <header className={styles.header}>
          <div className={styles.logoWrap}>
            <Image src="/td-studios-diamond-logo.png" alt="TD Studios diamond logo"
              width={128} height={128} priority unoptimized className={styles.logo} />
          </div>
          <h1 id="home-title" className={styles.title}>
            {isBio ? "TD STUDIOS" : mode === "signin" ? "Welcome back" : "Reset password"}
          </h1>
          <p className={isBio ? `${styles.description} ${styles.tagline}` : styles.description}>
            {isBio ? "Full service design & packaging agency." : "Your studio. All in one place."}
          </p>
        </header>

        {isBio ? (
          <nav className={styles.actions} aria-label="Studio services">
            <a ref={orderRef} href={ORDER.href} className={styles.order}>
              <span className={styles.orderIcon}><PackageIcon size={24} aria-hidden="true" /></span>
              <span className={styles.orderCopy}><strong>{ORDER.label}</strong><span>Custom mylar printing</span></span>
              <ArrowUpRightIcon size={22} aria-hidden="true" />
            </a>
            <div className={styles.grid}>
              {LINKS.map(({ label, href, icon: Icon, external }) => (
                <a key={label} href={href} className={styles.tile}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  <span className={styles.tileTop}><Icon size={23} aria-hidden="true" /><ArrowUpRightIcon size={14} aria-hidden="true" /></span>
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </nav>
        ) : (
          <div className={styles.form}>
            {mode === "signin" ? <LoginForm redirectTo={redirectTo} onForgot={() => setMode("forgot")} />
              : <ForgotPasswordForm onBack={() => setMode("signin")} />}
            <button type="button" className={styles.back} onClick={() => setMode("bio")}>
              <ArrowLeftIcon size={16} aria-hidden="true" /> Back
            </button>
          </div>
        )}
        <footer className={styles.footer}>@TDSTUDIOSCO <span aria-hidden="true">/</span> NEW YORK</footer>
      </section>
      {isBio && showSticky && (
        <div className={styles.sticky}>
          <a href={ORDER.href}><PackageIcon size={18} aria-hidden="true" />{ORDER.label}<ArrowRightIcon size={18} aria-hidden="true" /></a>
        </div>
      )}
    </>
  );
}

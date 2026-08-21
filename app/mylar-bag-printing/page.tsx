import Link from "next/link";
import {
  ArrowLeftIcon,
  ChatCircleTextIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { MylarOrderForm } from "@/app/mylar-bag-printing/mylar-order-form";
import { HomeLogoLink } from "@/components/layout/home-logo";

export const metadata = {
  title: "Mylar Bag Printing",
  description:
    "Order custom printed mylar bags from TD Studios — 4x5 / 3.5g, 5x4 sideways, 2-in-1 split, and pound bags.",
};

/** Same sms: handoff as the home card — kept in one place per page. */
const TEXT_HREF = "sms:+19297528373";

/**
 * Public, no-auth ordering form for custom printed mylar bags, reached from the
 * home "link in bio" card. Like /custom-design-request and /how-to-order it
 * posts to Formspree with artwork uploaded separately to the private
 * `design-requests` bucket — no database, no order records.
 */
export default function MylarBagPrintingPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Mylar Bag Printing
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Pick your bag style and quantity, send over your artwork, and
            I&apos;ll get back to you with pricing and a proof.
          </p>
        </header>

        <MylarOrderForm />

        {/* Texting stays available for anyone who'd rather not use the form.
            No target="_blank" — the OS takes the navigation and would otherwise
            leave an empty tab behind. */}
        <a
          href={TEXT_HREF}
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12] active:translate-y-px"
        >
          <ChatCircleTextIcon weight="bold" className="size-4" />
          Text Me Instead
        </a>

        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <ArrowLeftIcon weight="bold" className="size-3.5" />
          Back to TD Studios
        </Link>
      </div>
    </main>
  );
}

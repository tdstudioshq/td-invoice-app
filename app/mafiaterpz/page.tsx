/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import {
  enterMafiaTerpzCodeAction,
  hasMafiaTerpzAccess,
} from "@/app/mafiaterpz/access";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { getMafiaTerpzImages } from "@/lib/data";

const LOGO = "/mafia-terpz-logo.png";

export const metadata = {
  title: "MAFIA terpz",
  description: "The MAFIA terpz gallery by TD Studios.",
  openGraph: {
    title: "MAFIA terpz",
    description: "The MAFIA terpz gallery by TD Studios.",
    images: [{ url: LOGO }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MAFIA terpz",
    images: [LOGO],
  },
};

// Reads the access cookie + MAFIA terpz Storage bucket per request. The keypad
// gate is enforced here on the server, so gallery image URLs are never in the
// HTML until the code has been entered.
export const dynamic = "force-dynamic";

export default async function MafiaTerpzPage() {
  const unlocked = await hasMafiaTerpzAccess();

  if (!unlocked) {
    return (
      <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
          <TasteBudzKeypad
            logoUrl={LOGO}
            logoAlt="MAFIA terpz"
            logoClassName="w-full max-w-xs"
            action={enterMafiaTerpzCodeAction}
          />
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

  const images = await getMafiaTerpzImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <img
            src={LOGO}
            alt="MAFIA terpz"
            className="w-full max-w-xs sm:max-w-sm"
          />
          <h1 className="sr-only">MAFIA terpz</h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No MAFIA terpz images yet."
          emptyHint="Upload images to the MAFIA terpz bucket and they'll appear here automatically."
        />

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

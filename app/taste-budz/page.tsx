/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { hasTasteBudzAccess } from "@/app/taste-budz/access";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { getTasteBudzImages } from "@/lib/data";

// Self-hosted copy of the bucket logo: social crawlers get a stable
// same-origin URL (resolved absolute via metadataBase in the root layout).
const TASTE_BUDZ_LOGO = "/taste-budz-logo.png";

export const metadata = {
  title: "TASTE BUDZ",
  description: "The TASTE BUDZ gallery by TD Studios.",
  openGraph: {
    title: "TASTE BUDZ",
    description: "The TASTE BUDZ gallery by TD Studios.",
    images: [{ url: TASTE_BUDZ_LOGO }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TASTE BUDZ",
    images: [TASTE_BUDZ_LOGO],
  },
};

// Reads the access cookie + TASTE BUDZ Storage bucket per request. The keypad
// gate is enforced here on the server, so gallery image URLs are never in the
// HTML until the code has been entered.
export const dynamic = "force-dynamic";

export default async function TasteBudzPage() {
  const unlocked = await hasTasteBudzAccess();

  if (!unlocked) {
    return (
      <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
          <TasteBudzKeypad logoUrl={TASTE_BUDZ_LOGO} />
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

  const images = await getTasteBudzImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <img
            src={TASTE_BUDZ_LOGO}
            alt="TASTE BUDZ"
            className="w-full max-w-xs sm:max-w-sm"
          />
          <h1 className="sr-only">TASTE BUDZ</h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No TASTE BUDZ images yet."
          emptyHint="Upload images to the TASTE BUDZ bucket and they'll appear here automatically."
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

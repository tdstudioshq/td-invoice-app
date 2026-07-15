/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { enterDesignsCodeAction, hasDesignsAccess } from "@/app/designs/access";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { getGsoImages } from "@/lib/data";

const LOGO = "/logo.png";

export const metadata = {
  title: "Designs",
  description: "The designs gallery by TD Studios.",
  openGraph: {
    title: "Designs",
    description: "The designs gallery by TD Studios.",
    images: [{ url: LOGO }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Designs",
    images: [LOGO],
  },
};

// Reads the access cookie + GSO Storage bucket per request. The keypad gate is
// enforced here on the server, so gallery image URLs are never in the HTML
// until the code has been entered.
export const dynamic = "force-dynamic";

export default async function DesignsPage() {
  const unlocked = await hasDesignsAccess();

  if (!unlocked) {
    return (
      <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
          <TasteBudzKeypad
            logoUrl={LOGO}
            logoAlt="TD Studios"
            logoClassName="size-28 rounded-full"
            action={enterDesignsCodeAction}
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

  const images = await getGsoImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO} alt="TD Studios" className="size-24 rounded-full" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Designs
          </h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No designs yet."
          emptyHint="Upload images to the GSO bucket and they'll appear here automatically."
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

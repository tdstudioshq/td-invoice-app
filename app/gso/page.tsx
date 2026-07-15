import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { getGsoImages } from "@/lib/data";

export const metadata = {
  title: "GSO",
  description: "The GSO gallery by TD Studios.",
};

// Reads the GSO Storage bucket per request, so images uploaded later appear
// automatically without a redeploy.
export const dynamic = "force-dynamic";

export default async function GsoPage() {
  const images = await getGsoImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">GSO</h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No GSO images yet."
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

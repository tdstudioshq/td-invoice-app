import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import { ArrowLeftIcon, PaintBrushIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { getPortfolioImages } from "@/lib/data";

export const metadata = {
  title: "Portfolio",
  description:
    "A gallery of custom design work by TD Studios — packaging, logos, websites, branding, and mockups.",
};

// Reads the custom-work Storage bucket per request, so images uploaded later
// appear automatically without a redeploy.
export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const images = await getPortfolioImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Portfolio
          </h1>
          <Link
            href="/custom-design-request"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:border-white/25 hover:bg-white/[0.12] active:translate-y-px"
          >
            <PaintBrushIcon weight="bold" className="size-4" />
            Request Custom Work
          </Link>
        </header>

        <PortfolioGallery images={images} />

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

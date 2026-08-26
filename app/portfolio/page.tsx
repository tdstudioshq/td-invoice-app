import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import { PaintBrushIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { getPortfolioImages } from "@/lib/data";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

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
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Portfolio
          </h1>
          <Link
            href="/custom-design-request"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 min-h-12 px-5 py-2.5 text-base font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] md:text-sm backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25 active:translate-y-px"
          >
            <PaintBrushIcon weight="bold" className="size-4" />
            Request Custom Work
          </Link>
        </header>

        <PortfolioGallery images={images} />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

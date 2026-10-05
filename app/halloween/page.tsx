import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { getHalloweenImages } from "@/lib/queries/galleries";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

export const metadata = {
  title: "Halloween",
  description: "The Halloween gallery by TD Studios.",
};

// Reads the Halloween Storage bucket per request, so designs published later with
// `npm run gallery:upload -- HALLOWEEN <folder>` appear without a redeploy.
export const dynamic = "force-dynamic";

export default async function HalloweenPage() {
  const images = await getHalloweenImages();

  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">Halloween</h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No Halloween designs yet."
          emptyHint="Check back soon for Halloween designs."
        />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

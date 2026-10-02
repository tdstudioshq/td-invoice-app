import { AnimatedBackground } from "@/app/login/animated-background";
import { PortfolioGallery } from "@/app/portfolio/portfolio-gallery";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { getApImages } from "@/lib/queries/galleries";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

export const metadata = {
  title: "AP",
  description: "The AP gallery by TD Studios.",
};

// Reads the AP Storage bucket per request, so designs published later with
// `npm run gallery:upload -- AP <folder>` appear without a redeploy.
export const dynamic = "force-dynamic";

export default async function ApPage() {
  const images = await getApImages();

  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">AP</h1>
        </header>

        <PortfolioGallery
          images={images}
          emptyTitle="No AP designs yet."
          emptyHint="Publish them with npm run gallery:upload -- AP <folder> and they'll appear here automatically."
        />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

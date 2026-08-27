import { HomeLogoLink } from "@/components/layout/home-logo";

import { AnimatedBackground } from "@/app/login/animated-background";
import { WhiteAshGallery } from "@/app/whiteash/gallery";
import { BackToStudiosLink } from "@/components/layout/public-page-link";
import { getWhiteAshGallery } from "@/lib/white-ash-gallery";

export const metadata = {
  title: "White Ash Farms — Artwork Proofs",
  description:
    "Artwork proof gallery for White Ash Farms — browse the full set of 5×6 pouch designs.",
  // Unreleased client packaging: shareable by link, but kept out of search.
  robots: { index: false, follow: false },
};

export default async function WhiteAshPage() {
  const { rounds, total, generatedAt, assetBase } = await getWhiteAshGallery();

  const updated = generatedAt
    ? new Date(generatedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            White Ash Farms
          </h1>
          <p className="text-base text-white/70 md:text-sm">
            Client proof gallery · {total} designs
            {updated ? ` · updated ${updated}` : ""}
          </p>
        </header>

        {rounds.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="text-base text-white/70">
              The gallery is not available right now.
            </p>
            <p className="text-sm text-white/40">
              Please refresh in a moment, or contact TD Studios.
            </p>
          </div>
        ) : (
          <WhiteAshGallery rounds={rounds} assetBase={assetBase} />
        )}

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

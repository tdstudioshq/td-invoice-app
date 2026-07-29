import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { DesignsGallery } from "@/app/qr-generator/designs/gallery";
import { getDesignsImages } from "@/lib/data";

export const metadata = {
  title: "Premade Designs",
  description:
    "Browse TD Studios premade printing designs — a gallery of ready-to-order artwork.",
};

// Reads the DESIGNS Storage bucket per request, so designs uploaded later appear
// automatically without a redeploy. This replaced an fs.readdir over
// public/promoimages, which baked the list in at build time.
export const dynamic = "force-dynamic";

/**
 * Volume pricing shown above the gallery. Every tier carries the same "each"
 * suffix so the three cards stay the same height in the grid — edit the labels
 * and prices here to change them.
 */
const PRICING_TIERS = [
  { label: "Single Design", price: "$25" },
  { label: "5+ Designs", price: "$20" },
  { label: "25+ Designs", price: "$15" },
];

export default async function PremadeDesignsPage() {
  // getDesignsImages() already returns newest-first and swallows listing errors
  // into an empty array (logged server-side in listPublicBucketImages).
  const images = (await getDesignsImages()).map((image) => image.url);

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Premade Designs
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Browse our ready-to-order artwork. Tap any design to expand it.
          </p>
        </header>

        <section
          aria-labelledby="pricing-heading"
          className="mx-auto flex w-full max-w-2xl flex-col gap-3"
        >
          <h2
            id="pricing-heading"
            className="text-center text-xs tracking-[0.25em] text-white/50"
          >
            PRICING
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {PRICING_TIERS.map(({ label, price }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/15 bg-white/[0.06] px-2 py-4 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md sm:px-4"
              >
                <span className="text-muted-foreground text-[0.7rem] leading-tight sm:text-sm">
                  {label}
                </span>
                <span className="text-2xl leading-none text-white sm:text-4xl">
                  {price}
                </span>
                <span className="text-muted-foreground text-[0.65rem] leading-none sm:text-xs">
                  each
                </span>
              </div>
            ))}
          </div>
        </section>

        {images.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">
            No designs available yet. Check back soon.
          </p>
        ) : (
          <DesignsGallery images={images} />
        )}

        <Link
          href="/qr-generator"
          className="text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <ArrowLeftIcon weight="bold" className="size-3.5" />
          Back to QR Code Generator
        </Link>
      </div>
    </main>
  );
}

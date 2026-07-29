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

import { HomeLogoLink } from "@/components/layout/home-logo";

import { AnimatedBackground } from "@/app/login/animated-background";
import { DesignsGallery } from "@/app/premadedesigns/gallery";
import {
  buildPremadeCollections,
  getPremadeDesigns,
  PREMADE_COLLECTIONS_PAGE_SIZE,
  PREMADE_DESIGNS_PAGE_SIZE,
  signPremadeDesignUrls,
} from "@/lib/premade-designs";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

export const metadata = {
  title: "Premade Designs",
  description:
    "Browse TD Studios premade printing designs — a gallery of ready-to-order artwork.",
};

// Reads the private premade-designs Storage bucket per request. The route is
// open: the keypad gate was removed, so the catalog is public. Image bytes are
// still reached only through short-lived signed URLs, never a public bucket URL.
export const dynamic = "force-dynamic";

export default async function PremadeDesignsPage() {
  const designs = await getPremadeDesigns();
  const collections = buildPremadeCollections(designs);
  const uniqueDesignCount = new Set(
    designs.map((design) => design.contentHash),
  ).size;

  // Sign only what the first screen shows. With more than one collection that
  // is the index's cover images; with a single collection the gallery opens
  // straight into its designs, so sign those instead.
  const initialPaths =
    collections.length > 1
      ? collections
          .slice(0, PREMADE_COLLECTIONS_PAGE_SIZE)
          .map((collection) => collection.cover.path)
      : designs.slice(0, PREMADE_DESIGNS_PAGE_SIZE).map((design) => design.path);
  const initialSigned = await signPremadeDesignUrls(initialPaths).catch(() => ({
    urls: {},
    expiresAt: 0,
  }));

  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Premade Designs
          </h1>
          <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-sm">
            ADD YOUR LOGO &amp; QR CODE &amp; RECEIVE YOUR FILE VIA GOOGLE DRIVE
          </p>
          <p className="text-sm text-white/60 md:text-xs">
            {uniqueDesignCount.toLocaleString()} designs
            {collections.length > 1
              ? ` across ${collections.length.toLocaleString()} collections`
              : " in the private collection"}
          </p>
        </header>

        {designs.length === 0 ? (
          <p className="text-muted-foreground text-center text-base md:text-sm">
            No designs available yet. Check back soon.
          </p>
        ) : (
          <DesignsGallery designs={designs} initialSigned={initialSigned} />
        )}

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

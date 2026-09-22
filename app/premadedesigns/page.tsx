import { HomeLogoLink } from "@/components/layout/home-logo";
import {
  LockKeyOpenIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import {
  enterPremadeDesignsCodeAction,
  hasPremadeDesignsAccess,
  lockPremadeDesignsAction,
} from "@/app/premadedesigns/access";
import { DesignsGallery } from "@/app/premadedesigns/gallery";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
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

// Reads the access cookie and private premade-designs Storage bucket per request.
// No filenames or signed image URLs reach the browser until the keypad unlocks.
export const dynamic = "force-dynamic";

export default async function PremadeDesignsPage() {
  const unlocked = await hasPremadeDesignsAccess();

  if (!unlocked) {
    return (
      <main className="public-page on-glass relative flex min-h-svh flex-col items-center justify-center overflow-hidden">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
          <div className="text-on-photo flex flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-white/75 uppercase backdrop-blur-md md:text-[0.65rem]">
              <LockSimpleIcon weight="fill" className="size-3.5" />
              Private collection
            </span>
            <h1 className="public-title font-bold tracking-tight text-white">
              Premade Designs
            </h1>
            <p className="max-w-xs text-base leading-relaxed text-white/70 md:text-sm">
              Enter the four-digit access code to browse the full design vault.
            </p>
          </div>

          <div className="w-full rounded-[2rem] border border-white/15 bg-black/25 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-lg">
            <TasteBudzKeypad
              logoUrl="/td-studios-diamond-logo.png"
              logoAlt="TD Studios"
              logoClassName="w-24 drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
              hint="Enter your private gallery code."
              action={enterPremadeDesignsCodeAction}
            />
          </div>

          <BackToStudiosLink className="mx-auto" />
        </div>
      </main>
    );
  }

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
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-white/75 uppercase backdrop-blur-md md:text-[0.65rem]">
            <LockKeyOpenIcon weight="fill" className="size-3.5" />
            Gallery unlocked
          </span>
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

        <div className="flex flex-wrap items-center justify-center gap-4">
          <BackToStudiosLink className="mx-auto" />
          <form action={lockPremadeDesignsAction}>
            <button
              type="submit"
              className="text-on-photo -mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-white/60 transition-colors hover:text-white md:text-xs"
            >
              <LockSimpleIcon weight="bold" className="size-3.5" />
              Lock gallery
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

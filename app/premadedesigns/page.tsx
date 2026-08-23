import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import {
  ArrowLeftIcon,
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

export const metadata = {
  title: "Premade Designs",
  description:
    "Browse TD Studios premade printing designs — a gallery of ready-to-order artwork.",
};

// Reads the access cookie and private premade-designs Storage bucket per request.
// No filenames or signed image URLs reach the browser until the keypad unlocks.
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
  const unlocked = await hasPremadeDesignsAccess();

  if (!unlocked) {
    return (
      <main className="on-glass relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8">
          <div className="text-on-photo flex flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.18em] text-white/75 uppercase backdrop-blur-md">
              <LockSimpleIcon weight="fill" className="size-3.5" />
              Private collection
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Premade Designs
            </h1>
            <p className="max-w-xs text-sm leading-relaxed text-white/70">
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

          <BackHomeLink />
        </div>
      </main>
    );
  }

  const designs = await getPremadeDesigns();
  const collections = buildPremadeCollections(designs);

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
    <main className="on-glass relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[0.65rem] font-semibold tracking-[0.18em] text-white/75 uppercase backdrop-blur-md">
            <LockKeyOpenIcon weight="fill" className="size-3.5" />
            Gallery unlocked
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Premade Designs
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            ADD YOUR LOGO &amp; QR CODE &amp; RECEIVE YOUR FILE VIA GOOGLE DRIVE
          </p>
          <p className="text-xs text-white/60">
            {designs.length.toLocaleString()} designs
            {collections.length > 1
              ? ` across ${collections.length.toLocaleString()} collections`
              : " in the private collection"}
          </p>
        </header>

        <section
          aria-labelledby="pricing-heading"
          className="mx-auto flex w-full max-w-2xl flex-col gap-3"
        >
          <h2
            id="pricing-heading"
            className="text-center text-xs tracking-[0.2em] text-white/70"
          >
            PRICING
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {PRICING_TIERS.map(({ label, price }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-white/15 bg-black/35 px-2 py-4 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md sm:px-4"
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

        {designs.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">
            No designs available yet. Check back soon.
          </p>
        ) : (
          <DesignsGallery designs={designs} initialSigned={initialSigned} />
        )}

        <div className="flex flex-wrap items-center justify-center gap-4">
          <BackHomeLink />
          <form action={lockPremadeDesignsAction}>
            <button
              type="submit"
              className="text-on-photo inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
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

function BackHomeLink() {
  return (
    <Link
      href="/"
      className="text-on-photo text-muted-foreground hover:text-foreground mx-auto inline-flex items-center gap-1.5 text-xs transition-colors"
    >
      <ArrowLeftIcon weight="bold" className="size-3.5" />
      Back to TD Studios
    </Link>
  );
}

import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";
import { CUTLINE_PRESETS } from "@/lib/cutline/presets";

import { CutlineGenerator } from "./cutline-generator";

export const metadata = {
  title: "Cutline Generator",
  description:
    "Free cutline generator by TD Studios — drop 1200×1500 designs and download print-ready PDFs with the cut contour overlaid.",
};

// PUBLIC, no-auth tool. Anyone with the link can drop JPG/PNG designs and get
// print-ready PDFs with the vector cut contour overlaid. Nothing is stored:
// /api/cutline/generate composes each PDF in-request and streams it back.
export default function PublicCutlineGeneratorPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Cutline Generator
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Drop 1200×1500 designs to get print-ready PDFs with the cut contour
            overlaid. Batch supported — nothing is stored.
          </p>
        </header>

        <CutlineGenerator
          presets={CUTLINE_PRESETS.map((p) => ({
            id: p.id,
            label: p.label,
            description: p.description,
          }))}
        />

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

import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";
import { CUTLINE_PRESETS } from "@/lib/cutline/presets";

import { CutlineGenerator } from "./cutline-generator";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

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
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="text-on-photo relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Cutline Generator
          </h1>
          <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-sm">
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

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";

import { MockupSheetGenerator } from "./mockup-sheet-generator";

export const metadata = {
  title: "8-Piece Mockup Generator",
  description:
    "Free 8-piece mockup sheet generator by TD Studios — drag and drop up to 8 designs into a print-ready sheet and export as PNG, JPG, or PDF.",
};

// PUBLIC, no-auth tool. Artwork is decoded and previewed entirely in the
// browser (react-konva canvas); nothing is uploaded until the user exports,
// at which point /api/mockup-sheet/generate composes the final sheet
// server-side and streams it straight back. Nothing is persisted.
export default function EightPieceMockupGeneratorPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            8-Piece Mockup Generator
          </h1>
          <p className="text-muted-foreground max-w-lg text-sm">
            Drag up to 8 designs onto the sheet, reorder and fine-tune each one, then export
            a print-ready PNG, JPG, or PDF — no more relinking each image by hand.
          </p>
        </header>

        <MockupSheetGenerator />

        <div className="flex flex-col items-center gap-2">
          <Link
            href="/tools/mockup-generator"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Need a single bag mockup instead? Mylar Bag Mockup Generator →
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeftIcon weight="bold" className="size-3.5" />
            Back to TD Studios
          </Link>
        </div>
      </div>
    </main>
  );
}

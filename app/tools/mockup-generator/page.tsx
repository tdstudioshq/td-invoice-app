import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";

import { MockupGenerator } from "./mockup-generator";

export const metadata = {
  title: "Mylar Bag Mockup Generator",
  description:
    "Free 4×5 mylar bag mockup generator by TD Studios — drop 1200×1500 artwork and download finished bag mockups. Rendered in your browser, nothing uploaded.",
};

// PUBLIC, no-auth tool. Everything happens client-side on a <canvas>: artwork
// never leaves the visitor's browser and nothing touches the server or
// Supabase. The die-line geometry lives in `lib/mockup/geometry.ts`.
export default function PublicMockupGeneratorPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Mylar Bag Mockup Generator
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Drop 1200×1500 (4×5″) artwork and download finished bag mockups —
            die line, tear notches, and seal margin included. Everything renders
            in your browser; nothing is uploaded or stored.
          </p>
        </header>

        <MockupGenerator />

        <div className="flex flex-col items-center gap-2">
          <Link
            href="/tools/cutline-generator"
            className="text-muted-foreground hover:text-foreground text-xs transition-colors"
          >
            Need print-ready PDFs instead? Cutline Generator →
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

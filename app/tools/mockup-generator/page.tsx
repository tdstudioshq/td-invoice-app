import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";

import { MockupGenerator } from "./mockup-generator";
import {
  BackToStudiosLink,
  PublicPageLink,
} from "@/components/layout/public-page-link";

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
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="text-on-photo relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Mylar Bag Mockup Generator
          </h1>
          <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-sm">
            Drop 1200×1500 (4×5″) artwork and download finished bag mockups —
            die line, tear notches, and seal margin included. Everything renders
            in your browser; nothing is uploaded or stored.
          </p>
        </header>

        <MockupGenerator />

        <div className="flex flex-col items-center gap-1">
          <PublicPageLink href="/tools/bag-mockup-grid" showArrow={false}>
            Got a whole lineup? Bag Mockup Grid →
          </PublicPageLink>
          <PublicPageLink href="/tools/8pc-mockup-generator" showArrow={false}>
            Need a full sheet of 8 designs? 8-Piece Mockup Generator →
          </PublicPageLink>
          <PublicPageLink href="/tools/cutline-generator" showArrow={false}>
            Need print-ready PDFs instead? Cutline Generator →
          </PublicPageLink>
          <BackToStudiosLink />
        </div>
      </div>
    </main>
  );
}

import { HomeLogoLink } from "@/components/layout/home-logo";
import { AnimatedBackground } from "@/app/login/animated-background";

import { BagMockupGrid } from "./bag-mockup-grid";
import {
  BackToStudiosLink,
  PublicPageLink,
} from "@/components/layout/public-page-link";

export const metadata = {
  title: "Bag Mockup Grid",
  description:
    "Free bag mockup grid generator by TD Studios — drag and drop any number of designs and export them as a single grid sheet of finished bag mockups.",
};

// PUBLIC, no-auth tool. Each dropped image is rendered as a bag mockup
// entirely in the browser (react canvas, same renderer as /tools/mockup-generator)
// and arranged into a 4-column grid; nothing is uploaded until export, at
// which point /api/bag-mockup-grid/generate composes the final grid
// server-side and streams it straight back. Nothing is persisted.
export default function BagMockupGridPage() {
  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="text-on-photo relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">Bag Mockup Grid</h1>
          <p className="text-muted-foreground max-w-lg text-base leading-relaxed md:text-sm">
            Drag and drop any number of designs — each one becomes a finished bag mockup, laid
            out in a 4-column grid you can reorder and export as one image.
          </p>
        </header>

        <BagMockupGrid />

        <div className="flex flex-col items-center gap-1">
          <PublicPageLink href="/tools/mockup-generator" showArrow={false}>
            Just one bag? Mylar Bag Mockup Generator →
          </PublicPageLink>
          <BackToStudiosLink />
        </div>
      </div>
    </main>
  );
}

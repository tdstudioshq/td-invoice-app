import { readdir } from "node:fs/promises";
import { join } from "node:path";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { DesignsGallery } from "@/app/qr-generator/designs/gallery";

export const metadata = {
  title: "Premade Designs",
  description:
    "Browse TD Studios premade printing designs — a gallery of ready-to-order artwork.",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Read the promo images from /public at render time. With no dynamic APIs in
// use this page is statically generated, so the directory is read at build —
// where the files exist — and the resulting list is baked into the page.
async function getDesignImages(): Promise<string[]> {
  try {
    const dir = join(process.cwd(), "public", "promoimages");
    const files = await readdir(dir);
    return files
      .filter((name) =>
        IMAGE_EXTENSIONS.has(name.slice(name.lastIndexOf(".")).toLowerCase()),
      )
      .sort()
      .map((name) => `/promoimages/${name}`);
  } catch {
    return [];
  }
}

export default async function PremadeDesignsPage() {
  const images = await getDesignImages();

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo.png"
            alt="TD Studios"
            width={56}
            height={56}
            priority
            className="size-14 rounded-full shadow-[inset_0_1px_2px_rgba(255,255,255,0.4)] ring-1 ring-white/25"
          />
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

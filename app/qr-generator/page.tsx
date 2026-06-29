import { HomeLogoLink } from "@/components/layout/home-logo";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { QrGenerator } from "@/components/qr/qr-generator";

export const metadata = {
  title: "QR Code Generator",
  description:
    "Free QR code generator by TD Studios — turn any link into a scannable QR code and download it as PNG, SVG, or PDF.",
};

// Public, no-auth QR generator reachable from the home "link in bio" card. It
// reuses the same client generator as the admin /qr page but with the
// account-only "save as dynamic QR" feature disabled (allowSave={false}).
export default function PublicQrGeneratorPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            QR Code Generator
          </h1>
        </header>

        <QrGenerator allowSave={false} source="public" />

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

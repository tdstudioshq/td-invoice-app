import { HomeLogoLink } from "@/components/layout/home-logo";

import { AnimatedBackground } from "@/app/login/animated-background";
import { QrGenerator } from "@/components/qr/qr-generator";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

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
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            QR Code Generator
          </h1>
        </header>

        <QrGenerator allowSave={false} source="public" />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

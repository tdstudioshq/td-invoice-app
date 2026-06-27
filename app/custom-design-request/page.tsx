import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { CustomDesignForm } from "@/app/custom-design-request/custom-design-form";

export const metadata = {
  title: "Request Custom Design",
  description:
    "Request a custom design from TD Studios — tell us about your project and share your logos, assets, and references.",
};

// Public, no-auth custom design request form reachable from the home "link in
// bio" card. Submits directly to Formspree (no database, no Supabase).
export default function CustomDesignRequestPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
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
            Request Custom Design
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Tell us what you have in mind and share any logos or references —
            we&apos;ll bring your custom design to life.
          </p>
        </header>

        <CustomDesignForm />

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

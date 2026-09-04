import { HomeLogoLink } from "@/components/layout/home-logo";

import { AnimatedBackground } from "@/app/login/animated-background";
import { CustomDesignForm } from "@/app/custom-design-request/custom-design-form";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

export const metadata = {
  title: "Request Custom Design",
  description:
    "Request a custom design from TD Studios — tell us about your project and share your logos, assets, and references.",
};

// Public, no-auth custom design request form reachable from the home "link in
// bio" card. Submissions persist in Supabase and land in /design-requests.
export default function CustomDesignRequestPage() {
  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Request Custom Design
          </h1>
          <p className="text-muted-foreground max-w-md text-base leading-relaxed md:text-sm">
            Tell us what you have in mind and share any logos or references —
            we&apos;ll bring your custom design to life.
          </p>
        </header>

        <CustomDesignForm />

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

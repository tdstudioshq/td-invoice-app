import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { MylarPrintingWizard } from "@/components/mylar-printing/mylar-printing-wizard";
import { BackToStudiosLink } from "@/components/layout/public-page-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The root layout's title template appends " · TD Studios", so this renders as
// "Custom Mylar Printing · TD Studios".
export const metadata = {
  title: "Custom Mylar Printing",
  description:
    "Submit your custom Mylar bag printing order to TD Studios. Choose your bag size, quantity, upload your artwork, and request a printing quote.",
};

/** Same sms: handoff as the home card — no target="_blank", since the OS takes
 *  the navigation and would strand an empty tab behind it. */
const TEXT_HREF = "sms:+19297528373";

/**
 * Public, no-auth Custom Mylar Printing quote wizard — the primary CTA on the
 * home "link in bio" card. Allow-listed in proxy.ts.
 *
 * Unlike the older Formspree form at /custom-design-request, this one
 * persists: the submission is stored in
 * mylar_printing_inquiries with its artwork in the private `mylar-artwork`
 * bucket, and TD Studios works it from /mylar-requests in the dashboard.
 */
export default function MylarPrintingPage() {
  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      {/* ~896px: wide enough for two upload cards side by side without the
          wizard drifting away from the rest of the site's public pages. */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6 sm:gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            Custom Mylar Printing
          </h1>
        </header>

        <MylarPrintingWizard />

        <div className="flex flex-col items-center gap-3">
          <a
            href={TEXT_HREF}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-12 gap-2 border-white/15 bg-black/35 px-6 text-base text-white hover:bg-black/25 md:h-11 md:px-6 md:text-sm",
            )}
          >
            <ChatCircleTextIcon weight="bold" className="size-5 shrink-0 md:size-4" />
            Click to text
          </a>
          <BackToStudiosLink />
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowLeftIcon, ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { MylarPrintingWizard } from "@/components/mylar-printing/mylar-printing-wizard";

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
 * Unlike the older Formspree forms (/custom-design-request,
 * /mylar-bag-printing), this one persists: the submission is stored in
 * mylar_printing_inquiries with its artwork in the private `mylar-artwork`
 * bucket, and TD Studios works it from /mylar-requests in the dashboard.
 */
export default function MylarPrintingPage() {
  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-10 sm:py-12">
      <AnimatedBackground />
      {/* ~896px: wide enough for two upload cards side by side without the
          wizard drifting away from the rest of the site's public pages. */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Custom Mylar Printing
          </h1>
          <p className="text-muted-foreground max-w-md text-sm">
            Pick your bag, tell us how many, send your artwork — we&apos;ll come
            back with pricing and a proof.
          </p>
        </header>

        <MylarPrintingWizard />

        <div className="flex flex-col items-center gap-3">
          <a
            href={TEXT_HREF}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <ChatCircleTextIcon weight="bold" className="size-3.5" />
            Rather just text us? Tap here.
          </a>
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

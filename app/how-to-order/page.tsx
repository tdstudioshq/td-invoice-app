import {
  ChatCircleTextIcon,
} from "@phosphor-icons/react/dist/ssr";

import { AnimatedBackground } from "@/app/login/animated-background";
import { OrderForm } from "@/app/how-to-order/order-form";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { BackToStudiosLink } from "@/components/layout/public-page-link";

export const metadata = {
  title: "How to Order",
  description:
    "How to order premade and custom printing designs from TD Studios — a step-by-step guide.",
};

/**
 * The ordering steps, in order. Add or reword entries here — the list numbers
 * itself and the layout adapts, so no markup changes are needed.
 */
const ORDER_STEPS = [
  {
    title: "Screenshot the designs you are looking to order",
    detail:
      "Browse the Premade Designs gallery and screenshot everything you'd like to order.",
  },
  {
    title: "Send me your logo(s), QR code, and any other assets",
    detail:
      "Anything that is to be included on the front or back of your design.",
  },
  {
    title: "Additional notes",
    detail:
      "Add your notes below, upload your files, and leave your contact details so I can reach you.",
  },
];

/** Same sms: handoff as the home card — kept in one place per page. */
const TEXT_HREF = "sms:+19297528373";

export default function HowToOrderPage() {
  return (
    <main className="public-page on-glass relative flex min-h-svh flex-col items-center overflow-hidden">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-8">
        <header className="text-on-photo flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <h1 className="public-title font-bold tracking-tight text-white">
            How to Order
          </h1>
        </header>

        <ol className="flex flex-col gap-4">
          {ORDER_STEPS.map(({ title, detail }, i) => (
            <li
              key={title}
              className="flex items-start gap-4 rounded-2xl border border-white/15 bg-black/35 p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] backdrop-blur-md sm:p-5"
            >
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] text-lg leading-none text-white md:size-9"
              >
                {i + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg leading-tight text-white md:text-base">{title}</h2>
                <p className="text-muted-foreground text-base leading-relaxed md:text-sm">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* Step 3's inputs: notes, file upload, then contact details. */}
        <OrderForm />

        {/* Texting stays available for anyone who'd rather not use the form.
            No target="_blank" — the OS takes the navigation and would otherwise
            leave an empty tab behind. */}
        <a
          href={TEXT_HREF}
          className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-black/35 min-h-12 px-5 py-3.5 text-base font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22)] md:text-sm backdrop-blur-md transition-all hover:border-white/25 hover:bg-black/25 active:translate-y-px"
        >
          <ChatCircleTextIcon weight="bold" className="size-4" />
          Text Me to Order
        </a>

        <BackToStudiosLink className="mx-auto" />
      </div>
    </main>
  );
}

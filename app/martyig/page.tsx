/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { AtSign, UserRound, Users } from "lucide-react";

import { AnimatedBackground } from "@/app/login/animated-background";
import { enterMartyigCodeAction, hasMartyigAccess } from "@/app/martyig/access";
import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { StatCard } from "@/components/dashboard/stat-card";
import { MartyigTable } from "./martyig-table";
import leads from "./leads.json";

const LOGO = "/zazalogo.png";
const SOURCE = "martydetroit";

export const metadata = {
  title: "Marty IG Leads",
  description: "Instagram leads scraped from @martydetroit.",
  openGraph: {
    title: "Marty IG Leads",
    description: "Instagram leads scraped from @martydetroit.",
    images: [{ url: LOGO }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Marty IG Leads",
    images: [LOGO],
  },
};

// Reads the access cookie per request. The keypad gate is enforced here on the
// server, so the leads never reach the HTML until the code has been entered.
export const dynamic = "force-dynamic";

export default async function MartyigPage() {
  const unlocked = await hasMartyigAccess();

  if (!unlocked) {
    return (
      <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 py-12">
        <AnimatedBackground />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-8">
          <TasteBudzKeypad
            logoUrl={LOGO}
            logoAlt="Marty IG Leads"
            logoClassName="w-full max-w-[15rem]"
            action={enterMartyigCodeAction}
          />
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

  const total = leads.length;
  const named = leads.filter((lead) => lead.name).length;

  return (
    <main className="relative flex min-h-svh flex-col items-center overflow-hidden px-4 py-12">
      <AnimatedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <img src={LOGO} alt="Marty IG Leads" className="w-full max-w-[13rem]" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Marty IG Leads
          </h1>
          <p className="text-sm text-white/60">
            Instagram followers scraped from @{SOURCE}.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total leads"
            value={total.toLocaleString()}
            hint="Unique followers"
            icon={Users}
          />
          <StatCard
            label="With a name"
            value={named.toLocaleString()}
            hint={`${Math.round((named / total) * 100)}% of leads`}
            icon={UserRound}
          />
          <StatCard
            label="Source"
            value={`@${SOURCE}`}
            hint="Followers list"
            icon={AtSign}
          />
        </div>

        <MartyigTable />

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

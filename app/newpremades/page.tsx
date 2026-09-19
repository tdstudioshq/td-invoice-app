import { TasteBudzKeypad } from "@/app/taste-budz/keypad";
import { BackToStudiosLink } from "@/components/layout/public-page-link";
import { HomeLogoLink } from "@/components/layout/home-logo";
import { enterNewPremadesCodeAction, hasNewPremadesAccess, lockNewPremadesAction } from "./access";
import { NewPremadesGallery } from "./gallery";
import designs from "./manifest.json";

export const metadata = { title: "New Premades", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewPremadesPage() {
  const unlocked = await hasNewPremadesAccess();
  return (
    // `.public-page` rather than a bare `px-4 py-10`: this route was the only
    // public page still carrying its own padding, so in landscape it ran under
    // the notch rail and its footer sat behind iOS Safari's floating toolbar.
    <main className="public-page min-h-svh bg-[#09090b] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <HomeLogoLink />
          <p className="text-xs tracking-[.25em] text-white/60 uppercase">TD Studios · Private collection</p>
          <h1 className="public-title font-bold tracking-tight">New Premades</h1>
          <p className="max-w-md text-base leading-relaxed text-white/70 md:text-sm">{unlocked ? "Find your next design. Tap any artwork for a closer look." : "Enter your four-digit code to explore the collection."}</p>
        </header>
        {unlocked ? <NewPremadesGallery designs={designs} /> : (
          <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/15 bg-white/5 px-5 py-8 sm:px-6">
            <TasteBudzKeypad logoUrl="/td-studios-diamond-logo.png" logoAlt="TD Studios" logoClassName="w-20" hint="Enter your gallery code." action={enterNewPremadesCodeAction} />
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <BackToStudiosLink />
          {unlocked && <form action={lockNewPremadesAction}><button className="-mx-2 inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-white/65 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none md:text-xs" type="submit">Lock gallery</button></form>}
        </footer>
      </div>
    </main>
  );
}

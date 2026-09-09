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
    <main className="min-h-svh bg-[#09090b] px-4 py-10 text-white sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col items-center gap-4 text-center">
          <HomeLogoLink />
          <p className="text-xs tracking-[.25em] text-white/50 uppercase">TD Studios · Private collection</p>
          <h1 className="text-4xl font-bold sm:text-5xl">New Premades</h1>
          <p className="text-white/65">{unlocked ? "Find your next design. Tap any artwork for a closer look." : "Enter your four-digit code to explore the collection."}</p>
        </header>
        {unlocked ? <NewPremadesGallery designs={designs} /> : (
          <div className="mx-auto w-full max-w-sm rounded-3xl border border-white/15 bg-white/5 px-6 py-8">
            <TasteBudzKeypad logoUrl="/td-studios-diamond-logo.png" logoAlt="TD Studios" logoClassName="w-20" hint="Enter your gallery code." action={enterNewPremadesCodeAction} />
          </div>
        )}
        <footer className="flex items-center justify-center gap-6">
          <BackToStudiosLink />
          {unlocked && <form action={lockNewPremadesAction}><button className="min-h-11 rounded-lg px-3 text-sm text-white/65 hover:text-white focus-visible:outline-2" type="submit">Lock gallery</button></form>}
        </footer>
      </div>
    </main>
  );
}
